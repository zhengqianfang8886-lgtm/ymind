import { state, getPrimarySelectedNode, findNode, findParent, getActiveTab, sanitizeTreeForHistory, getActiveDocumentContext } from "../core/state.js";
import { undo, redo, executeCommand, executeCompoundCommand, COMMANDS } from "../core/history.js";
import { locateFocusedNode, smartAdaptiveCenter, zoomViewportByFactor, resetZoom100 } from "../core/camera.js";
import { syncInspectorUi } from "../ui/inspector.js";
import { addChildNode, addSiblingNode, deleteSelectedNodes, markDirtyAndRefresh } from "./node-actions.js";
import { startEditNode } from "../render/render.js";
import { lockCurrentTab, openVaultSetModal } from "../ui/vault.js";
import { closeTabWithConfirm, switchTabRelative, renderTabBar } from "../core/tab-manager.js";
import { createNewTab } from "../core/state.js";
import { smartCenterOnSelectedNode } from "../core/camera.js";
import { updateSecurityDockStatus } from "../ui/vault.js";
import { syncNotesDrawerWithActiveNode, closeNotesDrawer, openNotesDrawer, isNotesDrawerOpen } from "../ui/notes.js";
import { toggleRecallMode, openFlashcardModal } from "../ui/flashcards.js";
import { openVersionHistoryModal } from "../storage/storage.js";
import { openSearch, closeSearch, isSearchOpen } from "../ui/search.js";
import { showToast } from "../ui/dialog.js";
import { bus, EVENTS } from "../core/event-bus.js";

export function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  if (navigator.userAgentData?.platform) {
    return /mac|ios/i.test(navigator.userAgentData.platform);
  }
  return /macintosh|mac os x|macintel|ipad|iphone|ipod/i.test(navigator.userAgent || navigator.platform || "");
}

export function handleArrowNavigation(key, renderApp) {
  const ctx = getActiveDocumentContext();
  if (!ctx) return;
  let current = ctx.primarySelectedNode;
  const root = findNode(ctx.focusedRootId, ctx.mindData) || ctx.mindData;
  if (!root) return;

  if (!current) {
    ctx.selectNode(root.id);
    bus.emit(EVENTS.RENDER_APP);
    syncInspectorUi(ctx);
    locateFocusedNode(root.id, true, ctx, "keyboard");
    syncNotesDrawerWithActiveNode(ctx);
    return;
  }

  const isRoot = current.id === (ctx.focusedRootId || root.id);
  const parent = findParent(current.id, root);
  const structure = ctx.layoutStructure || "mindmap";
  let target = null;

  if (isRoot) {
    const rList = current.rightChildren || current.children?.filter((_, i) => i % 2 === 0) || [];
    const lList = current.leftChildren || current.children?.filter((_, i) => i % 2 === 1) || [];
    if (structure === "org-down") {
      if (key === "ArrowDown") target = current.children?.[0];
    } else if (structure === "logic-left") {
      if (key === "ArrowLeft") target = current.children?.[0];
    } else if (structure === "logic-right") {
      if (key === "ArrowRight") target = current.children?.[0];
    } else {
      if (key === "ArrowRight") target = rList[0] || current.children?.[0];
      else if (key === "ArrowLeft") target = lList[0] || current.children?.[0];
      else if (key === "ArrowDown") target = rList[0] || lList[0];
      else if (key === "ArrowUp") target = rList[rList.length - 1] || lList[lList.length - 1];
    }
  } else if (parent) {
    const isMindmapRootChild = structure === "mindmap" && parent.id === (ctx.focusedRootId || root.id);
    const siblings = isMindmapRootChild
      ? (current.branchDirection === "left"
          ? (parent.leftChildren || parent.children.filter((_, i) => i % 2 === 1))
          : (parent.rightChildren || parent.children.filter((_, i) => i % 2 === 0)))
      : (parent.children || []);

    const idx = siblings.findIndex(c => c.id === current.id);
    const dir = (structure === "org-down") ? "down" : ((structure === "logic-left" || current.branchDirection === "left") ? "left" : "right");

    const keyMap = dir === "down"
      ? { parent: "ArrowUp", child: "ArrowDown", prev: "ArrowLeft", next: "ArrowRight" }
      : (dir === "left"
          ? { parent: "ArrowRight", child: "ArrowLeft", prev: "ArrowUp", next: "ArrowDown" }
          : { parent: "ArrowLeft", child: "ArrowRight", prev: "ArrowUp", next: "ArrowDown" });

    if (key === keyMap.parent) target = parent;
    else if (key === keyMap.child && current.children?.length > 0 && !current.collapsed) target = current.children[0];
    else if (key === keyMap.prev && idx > 0) target = siblings[idx - 1];
    else if (key === keyMap.next && idx >= 0 && idx < siblings.length - 1) target = siblings[idx + 1];
  }

  if (target) {
    ctx.selectNode(target.id);
    bus.emit(EVENTS.RENDER_APP);
    syncInspectorUi(ctx);
    locateFocusedNode(target.id, true, ctx, "keyboard");
    syncNotesDrawerWithActiveNode(ctx);
  }
}

export function bindGlobalShortcuts(renderApp, performSave, triggerOpenFile) {
  window.addEventListener("keydown", async (e) => {
    const ctx = getActiveDocumentContext();
    const isMac = isApplePlatform();
    const cmd = isMac ? e.metaKey : e.ctrlKey;
    const isAlt = e.altKey;
    const code = e.code;
    const key = e.key.toLowerCase();

    // 🌟 无论在何处按下 Cmd/Ctrl + F，优先唤起搜索
    if (cmd && !isAlt && !e.shiftKey && (code === "KeyF" || key === "f")) {
      e.preventDefault();
      e.stopPropagation();
      openSearch();
      return;
    }

    // 🌟 1. 标准规范的 Escape 层级处理机制（严禁在画布上误退首页）
    if (e.key === "Escape") {
      const attrMenu = document.getElementById("menu-node-attributes");
      if (attrMenu && !attrMenu.classList.contains("hidden")) {
        attrMenu.classList.add("hidden");
        document.getElementById("btn-node-attributes")?.classList.remove("active");
        return;
      }
      const activeWrapper = document.querySelector(".dropdown-wrapper.active");
      if (activeWrapper) {
        activeWrapper.classList.remove("active");
        return;
      }
      const contextMenu = document.getElementById("apple-context-menu");
      if (contextMenu && !contextMenu.classList.contains("hidden")) {
        contextMenu.classList.add("hidden");
        return;
      }
      if (isSearchOpen()) {
        closeSearch();
        return;
      }
      if (isNotesDrawerOpen()) {
        closeNotesDrawer();
        return;
      }
      const lockScreen = document.getElementById("canvas-vault-lock-screen");
      if (lockScreen && !lockScreen.classList.contains("hidden")) {
        e.preventDefault();
        bus.emit(EVENTS.SHOW_HOME);
        return;
      }
      // 处于单分支专注模式时，按 Esc 退出专注
      const rootId = ctx?.mindData?.id || "root";
      if (ctx?.focusedRootId && ctx.focusedRootId !== rootId) {
        e.preventDefault();
        ctx.focusedRootId = rootId;
        ctx.isLayoutDirty = true;
        renderApp();
        smartAdaptiveCenter(null, true, ctx);
        return;
      }
      // 画布上选中节点时，按 Esc 取消选择，聚焦根节点
      if (ctx?.selectedIds && ctx.selectedIds.size > 0 && !ctx.selectedIds.has(rootId)) {
        e.preventDefault();
        ctx.selectNode(rootId);
        renderApp();
        syncInspectorUi(ctx);
        return;
      }
      // 仅当用户身处 Home Hub 首页时，按 Esc 返回导图
      const homeView = document.getElementById("home-view");
      if (homeView && !homeView.classList.contains("hidden") && state.tabs.length > 0) {
        e.preventDefault();
        bus.emit(EVENTS.SHOW_WORKSPACE);
        return;
      }
      return;
    }

    // 2. 文本输入中全面放行原生事件（浮层隐藏时防范残留 editingNodeId 锁死）
    const editorEl = document.getElementById("inline-editor");
    const isEditorActive = state.editingNodeId && editorEl && !editorEl.classList.contains("hidden");
    if (e.target.closest("input, textarea, select, [contenteditable=true]") || e.target.isContentEditable || isEditorActive) {
      return;
    }

    // 3. 方向键导航
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      handleArrowNavigation(e.key, renderApp);
      return;
    }

    // 4. Alt / Option 组合键系列
    if (isAlt && !cmd) {
      if (code === "KeyC" || key === "c" || key === "ç") {
        e.preventDefault();
        const docCtx = getActiveDocumentContext();
        const primary = docCtx?.primarySelectedNode;
        if (primary && primary.id !== docCtx?.focusedRootId) {
          smartAdaptiveCenter(primary, true, docCtx);
        } else {
          smartAdaptiveCenter(null, true, docCtx);
        }
        showToast("🎯 已自适应定位");
        return;
      }
      if (code === "Digit1" || code === "Numpad1" || key === "1" || key === "¡") {
        e.preventDefault();
        const curTab = getActiveTab();
        if (curTab && curTab.viewMode !== "mindmap") {
          curTab.viewMode = "mindmap";
          renderApp();
          showToast("🌳 切换至思维导图");
        }
        return;
      }
      if (code === "Digit2" || code === "Numpad2" || key === "2" || key === "™") {
        e.preventDefault();
        const curTab = getActiveTab();
        if (curTab && !curTab._isLocked && curTab.viewMode !== "outliner") {
          curTab.viewMode = "outliner";
          closeNotesDrawer();
          renderApp();
          showToast("📑 切换至大纲文档");
        }
        return;
      }
      if (code === "KeyF" || key === "f" || key === "ƒ") {
        e.preventDefault();
        const curTab = getActiveTab();
        if (curTab && !curTab._isLocked) {
          closeNotesDrawer();
          openFlashcardModal();
        }
        return;
      }
      if (code === "KeyR" || key === "r" || key === "®") {
        e.preventDefault();
        const curTab = getActiveTab();
        if (curTab && !curTab._isLocked) {
          toggleRecallMode(renderApp);
        }
        return;
      }
      if (code === "KeyN" || key === "n" || key === "˜") {
        e.preventDefault();
        if (isNotesDrawerOpen()) closeNotesDrawer();
        else openNotesDrawer();
        return;
      }
      if (code === "KeyL" || key === "l" || key === "¬") {
        e.preventDefault();
        closeNotesDrawer();
        const tab = getActiveTab();
        if (tab?.isEncrypted) lockCurrentTab();
        else openVaultSetModal();
        return;
      }
      if (code === "KeyX" || key === "x" || key === "≈") {
        e.preventDefault();
        const { toggleNodeTodo } = await import("../ui/todo.js");
        toggleNodeTodo();
        return;
      }
    }

    // 5. Cmd / Ctrl + Shift 组合键
    if (cmd && e.shiftKey) {
      if (code === "BracketLeft" || key === "{" || key === "[") {
        e.preventDefault();
        switchTabRelative(-1);
        return;
      }
      if (code === "BracketRight" || key === "}" || key === "]") {
        e.preventDefault();
        switchTabRelative(1);
        return;
      }
      if (code === "KeyH" || key === "h") {
        e.preventDefault();
        closeNotesDrawer();
        openVersionHistoryModal(renderApp);
        return;
      }
      if (code === "KeyZ" || key === "z") {
        e.preventDefault();
        redo(renderApp);
        syncNotesDrawerWithActiveNode();
        return;
      }
    }

    // 6. Cmd / Ctrl 单独组合键
    if (cmd && !e.shiftKey && !isAlt) {
      if (code === "KeyC" || key === "c") {
        const p = ctx?.primarySelectedNode;
        if (p) {
          e.preventDefault();
          state.clipboardBranch = sanitizeTreeForHistory(p);
          showToast(`📋 已复制分支「${p.text || "主题"}」`);
        }
        return;
      }
      if (code === "KeyX" || key === "x") {
        const p = ctx?.primarySelectedNode;
        if (p && p.id !== ctx.focusedRootId && ctx.mindData) {
          e.preventDefault();
          state.clipboardBranch = sanitizeTreeForHistory(p);
          const parent = findParent(p.id, ctx.mindData);
          if (parent) {
            const idx = parent.children.findIndex(c => c.id === p.id);
            ctx.executeCommand({
              type: COMMANDS.REMOVE_NODE,
              nodeId: p.id,
              oldParentId: parent.id,
              oldIndex: idx,
              oldNode: p
            });
            ctx.selectNode(parent.id);
            renderApp();
            showToast(`✂️ 已剪切分支「${p.text || "主题"}」`);
          }
        }
        return;
      }
      if (code === "KeyV" || key === "v") {
        const p = ctx?.primarySelectedNode || findNode(ctx?.focusedRootId, ctx?.mindData);
        if (p && state.clipboardBranch && ctx) {
          e.preventDefault();
          const cloned = sanitizeTreeForHistory(state.clipboardBranch);
          function refreshIds(n) {
            n.id = "node_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
            if (n.children) n.children.forEach(refreshIds);
          }
          refreshIds(cloned);
          ctx.executeCommand({
            type: COMMANDS.INSERT_NODE,
            parentId: p.id,
            index: p.children ? p.children.length : 0,
            node: cloned
          });
          p.collapsed = false;
          ctx.selectNode(cloned.id);
          ctx.isLayoutDirty = true;
          renderApp();
          showToast(`📥 已粘贴分支「${cloned.text || "主题"}」`);
        }
        return;
      }
      if (code === "KeyZ" || key === "z") {
        e.preventDefault();
        undo(renderApp);
        syncNotesDrawerWithActiveNode();
        return;
      }
      if (code === "KeyY" || key === "y") {
        e.preventDefault();
        redo(renderApp);
        syncNotesDrawerWithActiveNode();
        return;
      }
      if (code === "KeyS" || key === "s") {
        e.preventDefault();
        performSave();
        return;
      }
      if (code === "KeyO" || key === "o") {
        e.preventDefault();
        triggerOpenFile();
        return;
      }
      if (code === "KeyW" || key === "w") {
        e.preventDefault();
        const curTab = getActiveTab();
        if (curTab) await closeTabWithConfirm(curTab.id, renderApp, () => {});
        return;
      }
      if (code === "KeyT" || key === "t") {
        e.preventDefault();
        createNewTab();
        renderTabBar();
        bus.emit(EVENTS.RENDER_APP);
        syncInspectorUi();
        updateSecurityDockStatus();
        smartCenterOnSelectedNode(state, false);
        return;
      }
      if (key === "=" || key === "+" || code === "Equal" || code === "NumpadAdd") {
        e.preventDefault();
        zoomViewportByFactor(1.15);
        return;
      }
      if (key === "-" || key === "_" || code === "Minus" || code === "NumpadSubtract") {
        e.preventDefault();
        zoomViewportByFactor(1 / 1.15);
        return;
      }
      if (code === "Digit0" || code === "Numpad0" || key === "0") {
        e.preventDefault();
        resetZoom100();
        showToast("🔍 视图已重置为 100%");
        return;
      }
    }

    // 桌面通用 Ctrl+PageUp/Down 标签切换
    if (e.ctrlKey && !e.shiftKey && !isAlt) {
      if (code === "PageUp") {
        e.preventDefault();
        switchTabRelative(-1);
        return;
      }
      if (code === "PageDown") {
        e.preventDefault();
        switchTabRelative(1);
        return;
      }
    }

    // 7. 无修饰单键
    if (!cmd && !isAlt && !e.shiftKey) {
      if (e.key === "Tab") {
        e.preventDefault();
        addChildNode(renderApp);
        syncNotesDrawerWithActiveNode();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        addSiblingNode(renderApp);
        syncNotesDrawerWithActiveNode();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedNodes(renderApp);
        syncNotesDrawerWithActiveNode();
        return;
      }
      const isSpaceOrF2 = code === "Space" || key === " " || key === "spacebar" || key === "space" || code === "F2" || key === "f2";
      if (isSpaceOrF2) {
        e.preventDefault();
        const ctx = getActiveDocumentContext();
        const p = ctx?.primarySelectedNode || getPrimarySelectedNode(ctx);
        if (p && ctx) {
          startEditNode(p, state, () => bus.emit(EVENTS.RENDER_APP), false, ctx);
        }
        return;
      }
      if (["1", "2", "3", "4", "0"].includes(e.key)) {
        const primary = ctx?.primarySelectedNode;
        if (primary && ctx?.selectedIds && ctx.selectedIds.size > 0) {
          e.preventDefault();
          const pVal = e.key === "0" ? null : `P${e.key}`;
          const subCommands = [];
          ctx.selectedIds.forEach(id => {
            const n = findNode(id, ctx.mindData);
            if (n) {
              subCommands.push({
                type: COMMANDS.UPDATE_ATTRS,
                nodeId: n.id,
                oldAttrs: { priority: n.priority || null },
                newAttrs: { priority: pVal }
              });
            }
          });
          if (subCommands.length === 1) {
            ctx.executeCommand(subCommands[0], true);
          } else if (subCommands.length > 1) {
            ctx.executeCompoundCommand(subCommands, true);
          }
          syncInspectorUi(ctx);
          showToast(pVal ? `🚩 优先级已设为 ${pVal}` : "🚩 已清除优先级");
          return;
        }
      }
    }
  });
}
