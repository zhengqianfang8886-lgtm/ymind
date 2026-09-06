import { saveSessionImmediate } from "../storage/session.js";
import { state, getActiveTab, createNewTab, getPrimarySelectedNode, findNode, findParent, getActiveDocumentContext } from "../core/state.js";
import { saveSnapshot, executeCommand, COMMANDS } from "../core/history.js";
import { isNodeVisibleInTree } from "../core/tree-utils.js";
import { camera, requestTransformUpdate, startInertiaMomentum, stopAllCameraAnimations, locateFocusedNode, smartAdaptiveCenter, zoomViewportByFactor, resetZoom100 } from "../core/camera.js";
import { syncInspectorUi, applyCanvasThemeToBody } from "./inspector.js";
import { openNotesDrawer, syncNotesDrawerWithActiveNode, closeNotesDrawer } from "./notes.js";
import { showToast } from "./dialog.js";
import { serializeTabToPackage, deserializePackage, parseTextToTree, extractRealXMindZip } from "../core/serializer.js";
import { recordRecentDoc } from "./home.js";
import { showLockScreen, updateSecurityDockStatus } from "./vault.js";
import { startEditNode, setDropIndicator } from "../render/render.js";
import { isClickOnNodeLink, navigateDeepLink, promptEditNodeLink } from "./deep-link.js";
import { isClickOnCheckbox, toggleTaskDone, toggleNodeTodo } from "./todo.js";
import { isClickOnDueDatePill, promptEditDueDate } from "./due-date.js";
import { addChildNode, addSiblingNode, deleteSelectedNodes } from "../interaction/node-actions.js";
import { bindGlobalShortcuts } from "../interaction/shortcuts.js";
import { canvasMachine, CanvasState } from "../interaction/canvas-machine.js";
import { bus, EVENTS } from "../core/event-bus.js";

export { canvasMachine };
let gDropTarget = null;

// 🌟 强大的全树拓扑拾取算法：智能判定“跨分支挂载改父级”与“同级兄弟插入排序”
function calculateFullTreeDrop(worldX, worldY, dragNode) {
  const docCtx = getActiveDocumentContext();
  if (!dragNode || !docCtx || dragNode.id === docCtx.focusedRootId) return null;
  const curTab = docCtx.tab;
  if (!curTab?.spatialIndex) return null;

  // 1. 优先判定：是否悬停在某个目标节点本体上方 -> 触发【跨分支挂载为子节点 (Reparent)】
  const hoverNode = curTab.spatialIndex.pickNode(worldX, worldY, 10);
  const currentParent = findParent(dragNode.id, docCtx.mindData);

  // 正确防环校验：目标节点不能是自身、不能是自身后代(防死循环)、且不能是当前直接父节点(已经是其子节点)
  const isDescendant = hoverNode ? Boolean(findNode(hoverNode.id, dragNode)) : false;
  const isCurrentParent = currentParent && hoverNode && currentParent.id === hoverNode.id;

  if (hoverNode && hoverNode.id !== dragNode.id && !isDescendant && !isCurrentParent) {
    return {
      type: "reparent",
      targetParent: hoverNode,
      indicator: {
        type: "reparent",
        x: hoverNode.x,
        y: hoverNode.y,
        width: hoverNode.width,
        height: hoverNode.height
      }
    };
  }

  // 2. 次级判定：是否处于当前父级下的同级兄弟槽位 -> 触发【同级插入排序】
  const parent = findParent(dragNode.id, docCtx.mindData);
  if (!parent || !parent.children || parent.children.length <= 1) return null;

  const siblings = parent.children;
  const structure = docCtx.layoutStructure || "mindmap";

  if (structure === "org-down") {
    let closest = -1, minD = Infinity;
    for (let i = 0; i <= siblings.length; i++) {
      let slotX;
      if (i === 0) slotX = siblings[0].x - 12;
      else if (i === siblings.length) slotX = siblings[siblings.length - 1].x + siblings[siblings.length - 1].width + 12;
      else slotX = (siblings[i - 1].x + siblings[i - 1].width + siblings[i].x) / 2;

      let d = Math.abs(worldX - slotX);
      if (d < minD && d < 70 && Math.abs(worldY - siblings[0].y) < 140) {
        minD = d;
        closest = i;
      }
    }
    if (closest !== -1) {
      let lineX;
      if (closest === 0) lineX = siblings[0].x - 8;
      else if (closest === siblings.length) lineX = siblings[siblings.length - 1].x + siblings[siblings.length - 1].width + 8;
      else lineX = (siblings[closest - 1].x + siblings[closest - 1].width + siblings[closest].x) / 2;

      return {
        type: "reorder",
        parent,
        insertIndex: closest,
        indicator: { x1: lineX, y1: siblings[0].y - 8, x2: lineX, y2: siblings[0].y + siblings[0].height + 8 }
      };
    }
  } else {
    const sameSide = siblings.filter(s => {
      if (structure === "mindmap" && parent.id === docCtx.focusedRootId) {
        return s.branchDirection === dragNode.branchDirection;
      }
      return true;
    });
    if (sameSide.length > 1) {
      let closest = -1, minD = Infinity;
      for (let i = 0; i <= sameSide.length; i++) {
        let slotY;
        if (i === 0) slotY = sameSide[0].y - 10;
        else if (i === sameSide.length) slotY = sameSide[sameSide.length - 1].y + sameSide[sameSide.length - 1].height + 10;
        else slotY = (sameSide[i - 1].y + sameSide[i - 1].height + sameSide[i].y) / 2;

        let d = Math.abs(worldY - slotY);
        if (d < minD && d < 65 && Math.abs(worldX - sameSide[0].x) < 180) {
          minD = d;
          closest = i;
        }
      }

      if (closest !== -1) {
        let lineY;
        if (closest === 0) lineY = sameSide[0].y - 8;
        else if (closest === sameSide.length) lineY = sameSide[sameSide.length - 1].y + sameSide[sameSide.length - 1].height + 8;
        else lineY = (sameSide[closest - 1].y + sameSide[closest - 1].height + sameSide[closest].y) / 2;

        let minX = sameSide[0].x - 6;
        let maxX = sameSide[0].x + Math.max(...sameSide.map(s => s.width)) + 6;
        let insIdx = (closest === sameSide.length) ? (siblings.indexOf(sameSide[sameSide.length - 1]) + 1) : siblings.indexOf(sameSide[closest]);

        return {
          type: "reorder",
          parent,
          insertIndex: insIdx,
          indicator: { x1: minX, y1: lineY, x2: maxX, y2: lineY }
        };
      }
    }
  }

  return null;
}

async function callTauri(cmd, args = {}) {
  if (window.__TAURI__?.core?.invoke) return await window.__TAURI__.core.invoke(cmd, args);
  if (window.__TAURI__?.invoke) return await window.__TAURI__.invoke(cmd, args);
  if (window.__TAURI_INTERNALS__?.invoke) return await window.__TAURI_INTERNALS__.invoke(cmd, args);
  throw new Error("TAURI_IPC_UNAVAILABLE");
}



function computeDirectMarquee(minX, maxX, minY, maxY) {
  const { x, y, scale: s } = camera.transform;
  const worldL = (minX - x) / s, worldR = (maxX - x) / s;
  const worldT = (minY - y) / s, worldB = (maxY - y) / s;
  const hitSet = new Set();
  const docCtx = getActiveDocumentContext();
  const root = docCtx ? (findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData) : null;
  if (!root) return hitSet;

  function traverse(n) {
    if (n.x !== undefined && n.y !== undefined) {
      const nx2 = n.x + n.width, ny2 = n.y + n.height;
      if (!(nx2 < worldL || n.x > worldR || ny2 < worldT || n.y > worldB)) {
        hitSet.add(n.id);
      }
    }
    if (n.children && !n.collapsed) {
      for (let i = 0; i < n.children.length; i++) traverse(n.children[i]);
    }
  }
  traverse(root);
  return hitSet;
}

export function updateSelectionOnly() {
  bus.emit(EVENTS.RENDER_APP);
  syncNotesDrawerWithActiveNode();
}

export async function handleLoadedFileContent(contentData, filePath, renderApp) {
  closeNotesDrawer();
  let parsed = null;
  const isZipOrXmind = Boolean((filePath && /\.(xmind|zip)$/i.test(filePath)) || (contentData instanceof ArrayBuffer));

  if (contentData instanceof ArrayBuffer) {
    try {
      parsed = await extractRealXMindZip(contentData);
    } catch (err) {
      console.warn("[FileLoad] Failed to extract XMind zip:", err);
      const { appAlert } = await import("./dialog.js");
      await appAlert({
        title: "无法解析思维导图文件",
        message: "该文件不是合法的 XMind 压缩结构，或属于不支持的旧版 XMind 8 (XML) 架构，未能找到有效 content.json 数据。",
        type: "warning"
      });
      return;
    }
  } else if (typeof contentData === "string") {
    const trimmed = contentData.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        parsed = JSON.parse(contentData);
      } catch (err) {
        console.warn("[FileLoad] JSON parse error:", err);
      }
    }
    if (!parsed) {
      if (isZipOrXmind) {
        const { appAlert } = await import("./dialog.js");
        await appAlert({
          title: "无法打开文件",
          message: "该文件数据包已损坏或非标准 JSON 思维导图结构。",
          type: "warning"
        });
        return;
      }
      parsed = {
        title: filePath ? filePath.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "") : "本地导图",
        mindData: parseTextToTree(contentData)
      };
    }
  }

  if (!parsed) return;

  const cur = getActiveTab();
  const shouldReuse = cur && !cur.filePath && !cur.isDirty && (!cur.mindData?.children || cur.mindData.children.length === 0);
  let tab = shouldReuse ? cur : createNewTab();
  const res = deserializePackage(parsed, "本地思维导图", filePath);

  tab.filePath = (filePath && (filePath.includes("/") || filePath.includes("\\"))) ? filePath : null;
  tab.title = res.fileDisplayName;
  tab.layoutStructure = res.loadedLayout;
  tab.colorPalette = res.loadedPalette;
  tab.lineStyle = res.loadedLine;
  tab.boxStyle = res.loadedBox;
  tab.canvasBgColor = res.loadedBgColor;
  tab.canvasBgPattern = res.loadedBgPattern;
  tab.isDirty = false;
  state.isLayoutDirty = true;
  tab.versions = res.isEncrypted ? [] : (res.loadedVersions || []);

  if (res.isEncrypted) {
    tab.isEncrypted = true;
    tab.encryptedVault = res.encryptedVault;
    tab.mindData = { id: "root", text: "🔒 " + tab.title, children: [] };
    tab._isLocked = true;
    showLockScreen(tab);
    showToast("🔒 此文档已受密码保护，请输入密码解锁");
  } else {
    tab.isEncrypted = false;
    tab.encryptedVault = null;
    tab.mindData = res.loadedMindData;
    tab.selectedIds = new Set([tab.mindData.id || "root"]);
    tab.focusedRootId = tab.mindData.id || "root";
    showToast("📂 已打开: " + tab.title);
  }

  applyCanvasThemeToBody(tab.canvasBgColor, tab.canvasBgPattern);
  syncInspectorUi();
  updateSecurityDockStatus();

  // 🌟 核心修复：文件一旦成功加载，立即记录进最近文档列表！
  recordRecentDoc(tab.title, tab.mindData, tab.layoutStructure, tab.filePath, {
    colorPalette: tab.colorPalette,
    lineStyle: tab.lineStyle,
    boxStyle: tab.boxStyle,
    canvasBgColor: tab.canvasBgColor,
    canvasBgPattern: tab.canvasBgPattern
  }, tab.isEncrypted, tab.camera);

  bus.emit(EVENTS.SHOW_WORKSPACE);
}

export async function performSave(customTab = null) {
  let tab = customTab || getActiveTab();
  if (!tab) return;
  if (tab._isLocked) { showToast("⚠️ 请先输入密码解锁后再保存"); return; }

  const pkg = await serializeTabToPackage(tab);
  const contentStr = JSON.stringify(pkg.filePackage, null, 2);

  try {
    const savedPath = await callTauri("save_mindmap_file", {
      path: tab.filePath || null,
      defaultName: pkg.filenameWithExt,
      content: contentStr
    });
    if (!savedPath || savedPath === "CANCELLED") return;

    tab.filePath = savedPath;
    tab.title = savedPath.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");
    tab.isDirty = false;

    recordRecentDoc(tab.title, tab.mindData, tab.layoutStructure, tab.filePath, {
      colorPalette: tab.colorPalette,
      lineStyle: tab.lineStyle,
      boxStyle: tab.boxStyle,
      canvasBgColor: tab.canvasBgColor,
      canvasBgPattern: tab.canvasBgPattern
    }, tab.isEncrypted, tab.password, tab.passwordHint, tab.encryptedVault, tab.camera);

    bus.emit(EVENTS.RENDER_APP);
    saveSessionImmediate();
    showToast(tab.isEncrypted ? "🛡️ 「" + tab.title + "」已加密保存" : "💾 「" + tab.title + "」已保存");
  } catch {
    const blob = new Blob([contentStr], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = pkg.filenameWithExt;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    tab.isDirty = false;
    recordRecentDoc(tab.title, tab.mindData, tab.layoutStructure, tab.filePath, {
      colorPalette: tab.colorPalette,
      lineStyle: tab.lineStyle,
      boxStyle: tab.boxStyle,
      canvasBgColor: tab.canvasBgColor,
      canvasBgPattern: tab.canvasBgPattern
    }, tab.isEncrypted, tab.password, tab.passwordHint, tab.encryptedVault, tab.camera);

    bus.emit(EVENTS.RENDER_APP);
    saveSessionImmediate();
    showToast("💾 文件已下载保存为: " + pkg.filenameWithExt);
  }
}



function initNodeAttributeEvents(renderApp) {
  const btnAttr = document.getElementById("btn-node-attributes");
  const wrapper = btnAttr?.closest(".dropdown-wrapper");
  const menuAttr = document.getElementById("menu-node-attributes");
  if (!btnAttr || !menuAttr) return;

  // 🌟 核心破局点：提升至 document.body 顶层，彻底突破毛玻璃坐标系包裹与 overflow 裁切
  if (menuAttr.parentElement !== document.body) {
    document.body.appendChild(menuAttr);
  }
  menuAttr.classList.add("hidden");

  btnAttr.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = menuAttr.classList.contains("hidden");

    if (isHidden) {
      const rect = btnAttr.getBoundingClientRect();
      const menuWidth = 260;
      let leftPos = Math.round(rect.left + rect.width / 2 - menuWidth / 2);
      if (leftPos < 10) leftPos = 10;
      if (leftPos + menuWidth > window.innerWidth - 10) {
        leftPos = window.innerWidth - menuWidth - 10;
      }

      menuAttr.style.position = "fixed";
      menuAttr.style.top = `${Math.round(rect.bottom + 8)}px`;
      menuAttr.style.left = `${leftPos}px`;
      menuAttr.style.right = "auto";
      menuAttr.style.zIndex = "99999";
      menuAttr.classList.remove("hidden");
      btnAttr.classList.add("active");
    } else {
      menuAttr.classList.add("hidden");
      btnAttr.classList.remove("active");
    }
  });

  window.addEventListener("click", (e) => {
    if (!menuAttr.classList.contains("hidden")) {
      if (!menuAttr.contains(e.target) && !btnAttr.contains(e.target)) {
        menuAttr.classList.add("hidden");
        btnAttr.classList.remove("active");
      }
    }
  });

  // 1. 快捷图标点选响应
  document.querySelectorAll("[data-quick-icon]").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      menuAttr.classList.add("hidden"); btnAttr.classList.remove("active");
      const icon = chip.dataset.quickIcon;
      const docCtx = getActiveDocumentContext();
      const target = docCtx?.primarySelectedNode || getPrimarySelectedNode(docCtx);
      if (!target || !docCtx) return;

      docCtx.executeCommand({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: target.id,
        oldAttrs: { icon: target.icon || null },
        newAttrs: { icon: (target.icon === icon) ? null : icon }
      });

      docCtx.markLayoutDirty(target.id);
      bus.emit(EVENTS.RENDER_APP); // 🌟 修复：补齐重绘通知
      syncNotesDrawerWithActiveNode(docCtx);
    });
  });

  document.getElementById("btn-open-full-icons")?.addEventListener("click", (e) => {
    e.stopPropagation();
    menuAttr.classList.add("hidden"); btnAttr.classList.remove("active");
    const fs = document.getElementById("format-sidebar");
    const layout = document.querySelector(".workspace-body-layout");
    fs?.classList.remove("collapsed");
    document.getElementById("btn-toggle-format")?.classList.add("active");
    layout?.classList.add("sidebar-open");
    const iconSec = document.querySelector('.inspector-accordion-item[data-section="icons"]');
    if (iconSec) {
      iconSec.classList.add("open");
      iconSec.scrollIntoView({ behavior: "smooth" });
    }
  });

  // 2. 优先级点选响应
  document.querySelectorAll("#menu-priority .popover-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      menuAttr.classList.add("hidden"); btnAttr.classList.remove("active");
      const p = item.dataset.priority;
      const pVal = (p === "none") ? null : p;
      const docCtx = getActiveDocumentContext();
      const targetIds = (docCtx?.selectedIds && docCtx.selectedIds.size > 0)
        ? Array.from(docCtx.selectedIds)
        : [docCtx?.primarySelectedNode?.id].filter(Boolean);
      if (targetIds.length === 0 || !docCtx) return;

      const subCommands = [];
      targetIds.forEach(id => {
        const node = findNode(id, docCtx.mindData);
        if (node) {
          subCommands.push({
            type: COMMANDS.UPDATE_ATTRS,
            nodeId: node.id,
            oldAttrs: { priority: node.priority || null },
            newAttrs: { priority: pVal }
          });
          docCtx.markLayoutDirty(node.id);
        }
      });
      if (subCommands.length === 1) docCtx.executeCommand(subCommands[0], true);
      else if (subCommands.length > 1) docCtx.executeCompoundCommand(subCommands, true);

      syncInspectorUi(docCtx);
      bus.emit(EVENTS.RENDER_APP); // 🌟 修复：补齐重绘通知
    });
  });

  // 3. 进度点选响应
  document.querySelectorAll("#menu-progress .popover-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      menuAttr.classList.add("hidden"); btnAttr.classList.remove("active");
      const prg = item.dataset.progress;
      const prgVal = (prg === "none") ? null : prg;
      const docCtx = getActiveDocumentContext();
      const targetIds = (docCtx?.selectedIds && docCtx.selectedIds.size > 0)
        ? Array.from(docCtx.selectedIds)
        : [docCtx?.primarySelectedNode?.id].filter(Boolean);
      if (targetIds.length === 0 || !docCtx) return;

      const subCommands = [];
      targetIds.forEach(id => {
        const node = findNode(id, docCtx.mindData);
        if (node) {
          subCommands.push({
            type: COMMANDS.UPDATE_ATTRS,
            nodeId: node.id,
            oldAttrs: { progress: node.progress || null },
            newAttrs: { progress: prgVal }
          });
          docCtx.markLayoutDirty(node.id);
        }
      });
      if (subCommands.length === 1) docCtx.executeCommand(subCommands[0], true);
      else if (subCommands.length > 1) docCtx.executeCompoundCommand(subCommands, true);

      syncInspectorUi(docCtx);
      bus.emit(EVENTS.RENDER_APP); // 🌟 修复：补齐重绘通知
    });
  });

  const tagModal = document.getElementById("apple-modal-overlay");

  function renderTagModalList(node) {
    if (!tagModal) return;
    const tagList = tagModal.querySelector("#modal-tags-list");
    if (!tagList) return;

    const tags = Array.isArray(node.tags) ? node.tags : [];
    tagList.textContent = "";

    tags.forEach(t => {
      const tagStr = String(t);
      const tagSpan = document.createElement("span");
      tagSpan.className = "apple-modal-tag";

      const textSpan = document.createElement("span");
      textSpan.textContent = tagStr;

      const delSpan = document.createElement("span");
      delSpan.className = "tag-del-btn";
      delSpan.dataset.tag = tagStr;
      delSpan.style.cursor = "pointer";
      delSpan.style.fontWeight = "700";
      delSpan.textContent = "×";
      delSpan.onclick = (e) => {
        e.stopPropagation();
        const oldTags = [...(node.tags || [])];
        const newTags = oldTags.filter(item => item !== tagStr);
        const docCtx = getActiveDocumentContext();
        docCtx?.executeCommand({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: node.id,
          oldAttrs: { tags: oldTags },
          newAttrs: { tags: newTags }
        });
        docCtx?.markLayoutDirty(node.id);
        bus.emit(EVENTS.RENDER_APP);
        renderTagModalList(node);
      };

      tagSpan.appendChild(textSpan);
      tagSpan.appendChild(delSpan);
      tagList.appendChild(tagSpan);
    });
  }

  function addCurrentInputTag(node) {
    if (!tagModal) return;
    const tagInput = tagModal.querySelector("#modal-input");
    if (!tagInput) return;
    const val = tagInput.value.trim();
    if (!val) return;
    if (!Array.isArray(node.tags)) node.tags = [];
    const oldTags = [...(node.tags || [])];
    if (!oldTags.includes(val)) {
      const docCtx = getActiveDocumentContext();
      docCtx?.executeCommand({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: node.id,
        oldAttrs: { tags: oldTags },
        newAttrs: { tags: [...oldTags, val] }
      });
      docCtx?.markLayoutDirty(node.id);
      bus.emit(EVENTS.RENDER_APP);
      renderTagModalList(node);
    }
    tagInput.value = "";
    tagInput.focus();
  }

  document.getElementById("btn-open-tag-modal")?.addEventListener("click", (e) => {
    e.stopPropagation();
    menuAttr.classList.add("hidden"); btnAttr.classList.remove("active");
    const node = getPrimarySelectedNode();
    if (!node || !tagModal) return;

    renderTagModalList(node);
    const tagInput = tagModal.querySelector("#modal-input");
    if (tagInput) tagInput.value = "";
    tagModal.classList.remove("hidden");
    tagInput?.focus();

    tagModal.querySelector("#modal-btn-cancel").onclick = () => tagModal.classList.add("hidden");
    tagModal.querySelector("#modal-btn-confirm").onclick = () => addCurrentInputTag(node);
    tagInput.onkeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addCurrentInputTag(node);
      } else if (ev.key === "Escape") {
        tagModal.classList.add("hidden");
      }
    };
  });
}

export function initEventListeners(renderApp) {
  const vp = document.getElementById("viewport");
  const marquee = document.getElementById("marquee-box");
  let lastClickTime = 0, lastClickNodeId = null;

  // 状态机失焦自愈安全阀：窗口失去焦点自动安全重置
  window.addEventListener("blur", () => {
    if (!canvasMachine.is(CanvasState.IDLE)) {
      setDropIndicator(null);
      if (marquee) marquee.classList.add("hidden");
      canvasMachine.reset();
      bus.emit(EVENTS.RENDER_CANVAS_ONLY);
    }
  });

  vp?.addEventListener("dblclick", (e) => {
    if (e.target.closest(".canvas-floating-controls, .minimap-widget, .inline-editor")) return;
    const rect = vp.getBoundingClientRect();
    const s = camera.transform.scale;
    const worldX = (e.clientX - rect.left - camera.transform.x) / s;
    const worldY = (e.clientY - rect.top - camera.transform.y) / s;

    const docCtx = getActiveDocumentContext();
    const curTab = docCtx?.tab || getActiveTab();
    const curRoot = docCtx ? (findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData) : null;
    const isVisible = (id) => isNodeVisibleInTree(id, curRoot);

    const node = curTab?.spatialIndex?.pickNode(worldX, worldY, 8, isVisible);
    if (node) {
      e.preventDefault();
      e.stopPropagation();
      stopAllCameraAnimations();
      canvasMachine.transition(CanvasState.EDITING, { node });
      startEditNode(node, state, () => {
        canvasMachine.transition(CanvasState.IDLE);
        renderApp();
      }, false, docCtx);
    } else {
      // 🌟 双击空白背景：智能全景重置回正 (Fit to Screen)
      e.preventDefault();
      stopAllCameraAnimations();
      smartAdaptiveCenter(null, true, docCtx);
      showToast("🎯 视野已平滑回正");
    }
  });

  vp?.addEventListener("mousedown", (e) => {
    // 🌟 核心拦截：非鼠标左键（如右键菜单 e.button === 2）坚决禁止启动拖拽、框选与焦点位移
    if (e.button !== 0) return;
    if (e.target.closest(".canvas-floating-controls, .minimap-widget, .inline-editor")) return;
    if (state.editingNodeId) {
      document.getElementById("inline-editor")?.blur();
    }
    const rect = vp.getBoundingClientRect();
    const clickScreenX = e.clientX - rect.left;
    const clickScreenY = e.clientY - rect.top;
    const s = camera.transform.scale;
    const worldX = (clickScreenX - camera.transform.x) / s;
    const worldY = (clickScreenY - camera.transform.y) / s;

    const docCtx = getActiveDocumentContext();
    const curTab = docCtx?.tab || getActiveTab();
    const curRoot = docCtx ? (findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData) : null;
    const isVisible = (id) => isNodeVisibleInTree(id, curRoot);

    const badgeHitRadius = Math.max(13, 14 / s);
    let badgeNode = curTab?.spatialIndex?.pickCollapseBadge(worldX, worldY, docCtx?.focusedRootId, isVisible, badgeHitRadius);
    
    if (badgeNode) {
      e.stopPropagation();
      e.preventDefault();
      if (docCtx) {
        // 🌟 需求 1：收放节点时，焦点立即无缝切换到该节点上
        docCtx.selectNode(badgeNode.id);
        syncInspectorUi(docCtx);
        syncNotesDrawerWithActiveNode(docCtx);
        const isCascade = Boolean(e.altKey);
        const targetCollapsed = !badgeNode.collapsed;

        if (isCascade) {
          // 🌟 方案 A：⌥ Option / Alt + 点击徽章触发深度级联穿透收放 (Cascade Toggle)
          const subCommands = [];
          function collectCascadeNodes(n) {
            if (n.children && n.children.length > 0) {
              if (Boolean(n.collapsed) !== targetCollapsed) {
                subCommands.push({
                  type: COMMANDS.UPDATE_ATTRS,
                  nodeId: n.id,
                  oldAttrs: { collapsed: Boolean(n.collapsed) },
                  newAttrs: { collapsed: targetCollapsed }
                });
              }
              for (let i = 0; i < n.children.length; i++) {
                collectCascadeNodes(n.children[i]);
              }
            }
          }
          collectCascadeNodes(badgeNode);

          if (subCommands.length === 1) {
            docCtx.executeCommand(subCommands[0]);
          } else if (subCommands.length > 1) {
            docCtx.executeCompoundCommand(subCommands);
          }
          showToast(targetCollapsed ? "⏪ 已级联折叠所有子分支" : "⏩ 已级联展开所有子分支");
        } else {
          docCtx.executeCommand({
            type: COMMANDS.UPDATE_ATTRS,
            nodeId: badgeNode.id,
            oldAttrs: { collapsed: Boolean(badgeNode.collapsed) },
            newAttrs: { collapsed: targetCollapsed }
          });
        }
        docCtx.markLayoutDirty(badgeNode.id);
        bus.emit(EVENTS.RENDER_APP); // 🌟 0 延迟立即触发画布排版与重绘
      }
      return;
    }

    let node = curTab?.spatialIndex?.pickNode(worldX, worldY, 8, isVisible);
    

    if (node) {
      e.stopPropagation();
      // 🌟 单击截止日期胶囊直接呼出日期修改弹窗
      if (isClickOnDueDatePill(node, worldX, worldY)) {
        e.preventDefault();
        promptEditDueDate(node);
        return;
      }

      // 🌟 单击待办复选框直接切换完成状态并联动进度
      if (isClickOnCheckbox(node, worldX, worldY)) {
        e.preventDefault();
        toggleTaskDone(node);
        return;
      }

      // 🌟 单击 🔗 胶囊图标直接穿透跳转
      if (isClickOnNodeLink(node, worldX, worldY)) {
        e.preventDefault();
        navigateDeepLink(node.link);
        return;
      }
      if (docCtx?.isRecallMode && node.id !== docCtx?.focusedRootId) {
        node._unmasked = true;
        canvasMachine.transition(CanvasState.PEEK_RECALL, { node });
        bus.emit(EVENTS.RENDER_APP);
        return;
      }
      const now = Date.now();
      if (now - lastClickTime < 500 && lastClickNodeId === node.id) {
        lastClickTime = 0; lastClickNodeId = null;
        e.preventDefault();
        canvasMachine.transition(CanvasState.EDITING, { node });
        startEditNode(node, state, () => {
          canvasMachine.transition(CanvasState.IDLE);
          renderApp();
        }, false, docCtx);
        return;
      }
      lastClickTime = now;
      lastClickNodeId = node.id;

      const prevSelectedId = docCtx?.primarySelectedNode?.id || null;
      const isDraggable = node.id !== docCtx?.focusedRootId && !e.shiftKey;
      canvasMachine.transition(CanvasState.DRAGGING_NODE, {
        node,
        isDraggable,
        startX: e.clientX,
        startY: e.clientY,
        isMoved: false,
        prevSelectedId
      });

      if (docCtx) {
        if (e.shiftKey) {
          docCtx.selectNode(node.id, true);
        } else {
          docCtx.selectNode(node.id, false);
        }
      }

      bus.emit(EVENTS.RENDER_APP);
      syncInspectorUi(docCtx);
      syncNotesDrawerWithActiveNode(docCtx);
      return;
    }

    if (e.shiftKey) {
      canvasMachine.transition(CanvasState.MARQUEE, {
        startX: clickScreenX,
        startY: clickScreenY
      });
      if (marquee) {
        marquee.style.left = clickScreenX + "px";
        marquee.style.top = clickScreenY + "px";
        marquee.style.width = "0px";
        marquee.style.height = "0px";
        marquee.classList.remove("hidden");
      }
      return;
    }

    stopAllCameraAnimations();
    state.isInteracting = true;
    canvasMachine.transition(CanvasState.PANNING, {
      panStart: { x: e.clientX - camera.transform.x, y: e.clientY - camera.transform.y },
      lastX: e.clientX,
      lastY: e.clientY,
      lastTime: performance.now(),
      vel: { x: 0, y: 0 }
    });
  });

  window.addEventListener("mousemove", (e) => {
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const s = camera.transform.scale;
    const wx = (e.clientX - rect.left - camera.transform.x) / s;
    const wy = (e.clientY - rect.top - camera.transform.y) / s;

    // 1. DRAGGING_NODE 状态响应
    if (canvasMachine.is(CanvasState.DRAGGING_NODE)) {
      const data = canvasMachine.payload;
      if (data && data.isDraggable) {
        if (!data.isMoved && Math.hypot(e.clientX - data.startX, e.clientY - data.startY) > 4) {
          data.isMoved = true;
          vp.style.cursor = "grabbing";
        }
        if (data.isMoved) {
          gDropTarget = calculateFullTreeDrop(wx, wy, data.node);
          setDropIndicator(gDropTarget ? gDropTarget.indicator : null);
          return;
        }
      }
    }

    // 2. PANNING 状态响应
    if (canvasMachine.is(CanvasState.PANNING)) {
      const pData = canvasMachine.payload;
      if (pData) {
        vp.style.cursor = "grabbing";
        const now = performance.now();
        const dt = now - pData.lastTime;
        if (dt > 10) {
          pData.vel = { x: (e.clientX - pData.lastX) / dt, y: (e.clientY - pData.lastY) / dt };
          pData.lastX = e.clientX;
          pData.lastY = e.clientY;
          pData.lastTime = now;
        }
        camera.transform.x = e.clientX - pData.panStart.x;
        camera.transform.y = e.clientY - pData.panStart.y;
        requestTransformUpdate();
        return;
      }
    }

    // 3. MARQUEE 状态响应
    if (canvasMachine.is(CanvasState.MARQUEE) && marquee) {
      const mData = canvasMachine.payload;
      if (mData) {
        const curX = e.clientX - rect.left, curY = e.clientY - rect.top;
        const minX = Math.min(curX, mData.startX), maxX = Math.max(curX, mData.startX);
        const minY = Math.min(curY, mData.startY), maxY = Math.max(curY, mData.startY);
        marquee.style.left = minX + "px";
        marquee.style.top = minY + "px";
        marquee.style.width = Math.max(1, maxX - minX) + "px";
        marquee.style.height = Math.max(1, maxY - minY) + "px";

        const hitIds = computeDirectMarquee(minX, maxX, minY, maxY);
        const docCtx = getActiveDocumentContext();
        const curSelected = docCtx?.selectedIds || new Set();
        const isSame = hitIds.size === curSelected.size && [...hitIds].every(id => curSelected.has(id));
        if (!isSame && docCtx) {
          docCtx.selectedIds = hitIds;
          bus.emit(EVENTS.RENDER_APP);
          syncNotesDrawerWithActiveNode(docCtx);
        }
        return;
      }
    }

    // 4. IDLE 状态下悬浮反馈 (rAF 节流调度)
    if (canvasMachine.is(CanvasState.IDLE)) {
      if (!window.__HOVER_RAF__) {
        window.__HOVER_RAF__ = requestAnimationFrame(() => {
          window.__HOVER_RAF__ = null;
          const docCtx = getActiveDocumentContext();
          const curTab = docCtx?.tab || getActiveTab();
          const curRoot = docCtx ? (findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData) : null;
          const isVisible = (id) => isNodeVisibleInTree(id, curRoot);

          const badgeHit = curTab?.spatialIndex?.pickCollapseBadge(wx, wy, docCtx?.focusedRootId, isVisible, Math.max(13, 14 / s));
          const nodeHit = badgeHit || curTab?.spatialIndex?.pickNode(wx, wy, 8, isVisible);

          if (e.shiftKey) {
            vp.style.cursor = nodeHit ? "pointer" : "crosshair";
          } else {
            vp.style.cursor = badgeHit ? "pointer" : (nodeHit ? "pointer" : "grab");
          }
        });
      }
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0 && !canvasMachine.isInteracting()) return;
    // 1. DRAGGING_NODE 结算
    if (canvasMachine.is(CanvasState.DRAGGING_NODE)) {
      const data = canvasMachine.payload;
      const docCtx = getActiveDocumentContext();
      if (data && data.isMoved && gDropTarget && data.node && docCtx) {
        const oldParent = findParent(data.node.id, docCtx.mindData);
        if (oldParent) {
          if (gDropTarget.type === "reparent") {
            const newParent = gDropTarget.targetParent;
            const oldIdx = oldParent.children.findIndex(c => c.id === data.node.id);
            const toIdx = newParent.children ? newParent.children.length : 0;
            docCtx.executeCommand({
              type: COMMANDS.MOVE_NODE,
              nodeId: data.node.id,
              fromParentId: oldParent.id,
              toParentId: newParent.id,
              fromIndex: oldIdx,
              toIndex: toIdx
            });
            newParent.collapsed = false;
            showToast(`🔀 已成功移入「${newParent.text}」下`);
          } else if (gDropTarget.type === "reorder") {
            const { parent, insertIndex } = gDropTarget;
            const oldIdx = parent.children.findIndex(c => c.id === data.node.id);
            if (oldIdx !== -1) {
              const finalIdx = (oldIdx < insertIndex) ? (insertIndex - 1) : insertIndex;
              docCtx.executeCommand({
                type: COMMANDS.MOVE_NODE,
                nodeId: data.node.id,
                fromParentId: parent.id,
                toParentId: parent.id,
                fromIndex: oldIdx,
                toIndex: finalIdx
              });
              showToast("↕️ 节点顺序已更新");
            }
          }
        }
      }
      // 🌟 单击切换焦点时，触发相机焦点跟随漫游追踪
      if (data && !data.isMoved && data.node && docCtx) {
        locateFocusedNode(data.node.id, true, docCtx, "click");
      }
      gDropTarget = null;
      setDropIndicator(null);
      bus.emit(EVENTS.RENDER_CANVAS_ONLY);
    }

    // 2. PEEK_RECALL 结算
    if (canvasMachine.is(CanvasState.PEEK_RECALL)) {
      const pNode = canvasMachine.payload?.node;
      if (pNode) {
        pNode._unmasked = false;
        bus.emit(EVENTS.RENDER_APP);
      }
    }

    // 3. PANNING 结算与惯性启动
    if (canvasMachine.is(CanvasState.PANNING)) {
      const pData = canvasMachine.payload;
      if (pData) {
        const timeSinceLastMove = performance.now() - pData.lastTime;
        if (timeSinceLastMove < 45 && (Math.abs(pData.vel.x) > 0.12 || Math.abs(pData.vel.y) > 0.12)) {
          startInertiaMomentum(pData.vel.x * 1.5, pData.vel.y * 1.5);
        } else {
          state.isInteracting = false;
          requestTransformUpdate();
        }
        const curTab = getActiveTab();
        if (curTab) curTab.camera = { ...camera.transform };
      }
    }

    // 4. MARQUEE 结算
    if (canvasMachine.is(CanvasState.MARQUEE)) {
      if (marquee) {
        marquee.classList.add("hidden");
        marquee.style.width = "0px";
        marquee.style.height = "0px";
      }
      syncInspectorUi();
      syncNotesDrawerWithActiveNode();
    }

    // 安全收敛至 IDLE 状态
    canvasMachine.reset();
  });

  vp?.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (state.editingNodeId) {
      // 🌟 编辑态严格阻断外部画布任何滚动与缩放，杜绝输入法候选框被打断，同时避免图层脱节
      return;
    }
    stopAllCameraAnimations();
    state.isInteracting = true;
    canvasMachine.transition(CanvasState.ZOOMING);

    const rect = vp.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (e.shiftKey) { camera.transform.x -= (e.deltaY || e.deltaX); requestTransformUpdate(); return; }
    if (e.altKey) { camera.transform.y -= e.deltaY; requestTransformUpdate(); return; }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 2 && Math.abs(e.deltaX) > 1) {
      camera.transform.x -= e.deltaX; requestTransformUpdate(); return;
    }

    let rawDelta = e.deltaY;
    if (e.deltaMode === 1) rawDelta *= 30;
    else if (e.deltaMode === 2) rawDelta *= 100;

    const zoomSensitivity = e.ctrlKey ? 0.008 : 0.001;
    const clampedDelta = Math.max(-100, Math.min(100, rawDelta));
    const zoomFactor = Math.exp(-clampedDelta * zoomSensitivity);
    const oldScale = camera.transform.scale;
    let newScale = Math.max(0.15, Math.min(3.0, oldScale * zoomFactor));

    if (Math.abs(newScale - oldScale) < 0.0001) return;
    const scaleRatio = newScale / oldScale;
    camera.transform.x = mx - (mx - camera.transform.x) * scaleRatio;
    camera.transform.y = my - (my - camera.transform.y) * scaleRatio;
    camera.transform.scale = newScale;

    const curTab = getActiveTab();
    if (curTab) curTab.camera = { ...camera.transform };
    requestTransformUpdate();

    clearTimeout(window.__ZOOM_REST_TIMER__);
    window.__ZOOM_REST_TIMER__ = setTimeout(() => {
      state.isInteracting = false;
      canvasMachine.reset();
      requestTransformUpdate();
    }, 120);
  }, { passive: false });

  document.getElementById("btn-add-child")?.addEventListener("click", () => {
    addChildNode(renderApp);
    syncNotesDrawerWithActiveNode();
  });
  document.getElementById("btn-add-sibling")?.addEventListener("click", () => {
    addSiblingNode(renderApp);
    syncNotesDrawerWithActiveNode();
  });
  document.getElementById("btn-delete")?.addEventListener("click", () => {
    deleteSelectedNodes(renderApp);
    syncNotesDrawerWithActiveNode();
  });
  document.getElementById("btn-undo")?.addEventListener("click", () => {
    undo(renderApp);
    syncNotesDrawerWithActiveNode();
  });
  document.getElementById("btn-redo")?.addEventListener("click", () => {
    redo(renderApp);
    syncNotesDrawerWithActiveNode();
  });
  document.getElementById("btn-node-note")?.addEventListener("click", () => openNotesDrawer());

  document.getElementById("btn-toggle-format")?.addEventListener("click", () => {
    const fs = document.getElementById("format-sidebar");
    const layout = document.querySelector(".workspace-body-layout");
    fs?.classList.toggle("collapsed");
    const isExpanded = !fs?.classList.contains("collapsed");
    document.getElementById("btn-toggle-format")?.classList.toggle("active", isExpanded);
    layout?.classList.toggle("sidebar-open", isExpanded);
  });
  document.getElementById("btn-close-format")?.addEventListener("click", () => {
    const fs = document.getElementById("format-sidebar");
    const layout = document.querySelector(".workspace-body-layout");
    fs?.classList.add("collapsed");
    document.getElementById("btn-toggle-format")?.classList.remove("active");
    layout?.classList.remove("sidebar-open");
  });

  document.getElementById("btn-zoom-in")?.addEventListener("click", () => zoomViewportByFactor(1.15));
  document.getElementById("btn-zoom-out")?.addEventListener("click", () => zoomViewportByFactor(1 / 1.15));
  document.getElementById("txt-zoom-level")?.addEventListener("click", () => resetZoom100());
  document.getElementById("btn-smart-center")?.addEventListener("click", () => {
    const docCtx = getActiveDocumentContext();
    const primary = docCtx?.primarySelectedNode;
    if (primary && primary.id !== docCtx.focusedRootId) {
      smartAdaptiveCenter(primary, true, docCtx);
    } else {
      smartAdaptiveCenter(null, true, docCtx);
    }
    showToast("🎯 已自适应定位");
  });

  async function triggerOpenFile() {
    closeNotesDrawer();
    try {
      const tauriResult = await callTauri("open_mindmap_file", {});
      if (!tauriResult || tauriResult === "CANCELLED") return;
      const [filePath, contentStr] = tauriResult;
      await handleLoadedFileContent(contentStr, filePath, renderApp);
    } catch {
      const fileInput = document.getElementById("global-file-input");
      if (!fileInput) return;
      fileInput.value = "";
      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const isXMind = file.name.endsWith(".xmind");
        const reader = new FileReader();
        if (isXMind) {
          reader.onload = async (ev) => await handleLoadedFileContent(ev.target.result, file.name, renderApp);
          reader.readAsArrayBuffer(file);
        } else {
          reader.onload = async (ev) => await handleLoadedFileContent(ev.target.result, file.name, renderApp);
          reader.readAsText(file);
        }
      };
      fileInput.click();
    }
  }

  document.getElementById("btn-save")?.addEventListener("click", () => performSave());
  document.getElementById("btn-open")?.addEventListener("click", triggerOpenFile);
  document.getElementById("nav-btn-open-file")?.addEventListener("click", triggerOpenFile);

  // 🌟 原生桌面体验：支持从系统 Finder/资源管理器直接拖拽文件入窗快速打开
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const isXMind = file.name.endsWith(".xmind");
    const reader = new FileReader();
    if (isXMind) {
      reader.onload = async (ev) => await handleLoadedFileContent(ev.target.result, file.name, renderApp);
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = async (ev) => await handleLoadedFileContent(ev.target.result, file.name, renderApp);
      reader.readAsText(file);
    }
  });

  initNodeAttributeEvents(renderApp);
  bindGlobalShortcuts(renderApp, performSave, triggerOpenFile);
}
