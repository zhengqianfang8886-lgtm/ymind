/**
 * 🌟 统一清理画布活动瞬态交互与 DOM 浮层闭包
 */
export function cleanupActiveTransientUI() {
  closeNotesDrawer();
  const inlineEditor = document.getElementById("inline-editor");
  if (inlineEditor && !inlineEditor.classList.contains("hidden")) {
    inlineEditor.blur();
  }
  state.editingNodeId = null;

  document.getElementById("menu-node-attributes")?.classList.add("hidden");
  document.getElementById("btn-node-attributes")?.classList.remove("active");
  document.getElementById("apple-context-menu")?.classList.add("hidden");
  const tabCtxMenu = document.getElementById("apple-tab-context-menu");
  if (tabCtxMenu) {
    tabCtxMenu.classList.add("hidden");
    tabCtxMenu.style.display = "none";
  }

  setDropIndicator(null);
  resetBreadcrumbSig();

  const outlinerSlice = document.querySelector(".outliner-virtual-slice");
  if (outlinerSlice) outlinerSlice.innerHTML = "";
}

import { saveSessionImmediate, scheduleSessionSave } from "../storage/session.js";
import { state, getActiveTab, createNewTab, closeTab, deepSeverTree } from "./state.js";
import { camera, smartCenterOnSelectedNode } from "./camera.js";
import { syncInspectorUi, applyCanvasThemeToBody } from "../ui/inspector.js";
import { recordRecentDoc } from "../ui/home.js";
import { showLockScreen, hideLockScreenDOM, updateSecurityDockStatus } from "../ui/vault.js";
import { appConfirm, showToast } from "../ui/dialog.js";
import { bus, EVENTS } from "./event-bus.js";
import { closeNotesDrawer } from "../ui/notes.js";
import { ensureLayoutReady, resetBreadcrumbSig, setDropIndicator } from "../render/render.js";

const tabList = document.getElementById("tab-list");
let isTabDelegationBound = false;

export function getTabDisplayFilename(tab) {
  if (!tab) return "未命名导图";
  if (tab.filePath) return tab.filePath.split(/[\\/]/).pop();
  return tab.title || (tab.mindData?.text?.trim()) || "未命名草稿";
}

export function activateTab(tabId) {
  if (!tabId || tabId === state.activeTabId) return;
  const targetTab = state.tabs.find(t => t.id === tabId);
  if (!targetTab) return;

  // 🌟 0ms 瞬间乐观切换高亮，杜绝任何肉眼可见的时滞
  if (tabList) {
    tabList.querySelectorAll(".apple-tab-item").forEach(el => {
      el.classList.toggle("active", el.dataset.tabId === tabId);
    });
  }

  closeNotesDrawer();
  // 🌟 BUG-03 防御：切换标签时强制提交正在编辑的输入框，杜绝旧文档闭包寄生到新文档画布
  const inlineEditor = document.getElementById("inline-editor");
  if (inlineEditor && !inlineEditor.classList.contains("hidden")) {
    inlineEditor.blur();
  }
  state.editingNodeId = null;

  const prev = getActiveTab();
  if (prev) prev.camera = { ...camera.transform };

  // 统一释放旧文档瞬态浮层、四叉树缓存并清理大纲 DOM 闭包
  cleanupActiveTransientUI();

  state.activeTabId = tabId;
  state.isLayoutDirty = true;
  targetTab.isLayoutDirty = true;

  camera.transform = { ...targetTab.camera };
  if (targetTab.isEncrypted && targetTab._isLocked) showLockScreen(targetTab);
  else hideLockScreenDOM();

  const btnRecall = document.getElementById("btn-active-recall");
  if (btnRecall) btnRecall.classList.toggle("active-mode", Boolean(targetTab.isRecallMode));

  try {
    ensureLayoutReady(targetTab, true);
  } catch {}

  renderTabBar();
  bus.emit(EVENTS.RENDER_APP);
  syncInspectorUi();
  updateSecurityDockStatus();
  scheduleSessionSave();
}

export function switchTabRelative(delta) {
  if (!state.tabs || state.tabs.length <= 1) return;
  const curIdx = state.tabs.findIndex(t => t.id === state.activeTabId);
  if (curIdx === -1) return;
  const nextIdx = (curIdx + delta + state.tabs.length) % state.tabs.length;
  activateTab(state.tabs[nextIdx].id);
}

export async function closeTabWithConfirm(tabId, renderApp, showHome) {
  const notifyRender = typeof renderApp === "function" ? renderApp : () => bus.emit(EVENTS.RENDER_APP);
  const notifyHome = typeof showHome === "function" ? showHome : () => bus.emit(EVENTS.SHOW_HOME);
  const t = state.tabs.find(tab => tab.id === tabId);
  if (!t) return;

  const displayName = getTabDisplayFilename(t);
  if (t.isDirty || !t.filePath) {
    const isUnsavedDraft = !t.filePath;
    const ok = await appConfirm({
      title: isUnsavedDraft ? "草稿未保存至文件" : "未保存的修改",
      message: `「${displayName}」尚未保存为本地文件。关闭标签页将退出当前编辑，确定要关闭吗？`,
      isDanger: true,
      confirmText: "确认关闭",
      cancelText: "继续编辑"
    });
    if (!ok) return;
  }

  // 🌟 关闭标签页前收起抽屉，杜绝悬挂指针
  closeNotesDrawer();

  const remaining = closeTab(t.id);
  if (remaining === 0) {
    renderTabBar();
    bus.emit(EVENTS.SHOW_HOME);
    return;
  }

  const cur = getActiveTab();
  if (cur) {
    camera.transform = { ...cur.camera };
    applyCanvasThemeToBody(cur.canvasBgColor || "studio-white", cur.canvasBgPattern || "dots");
    if (cur.isEncrypted && cur._isLocked) showLockScreen(cur);
    else hideLockScreenDOM();
  }
  renderTabBar();
  bus.emit(EVENTS.RENDER_APP);
  syncInspectorUi();
  updateSecurityDockStatus();
}

export function renderTabBar() {
  if (!tabList) return;

  if (state.tabs.length === 0) {
    bus.emit(EVENTS.SHOW_HOME);
    return;
  }

  const curTab = getActiveTab();
  if (curTab) {
    const displayName = getTabDisplayFilename(curTab);
    const isDraft = !curTab.filePath;
    document.title = (curTab.isDirty ? "● " : "") + (isDraft ? "[草稿] " : "") + displayName + " - YMind Pro";
  }

  const btnSave = document.getElementById("btn-save");
  if (btnSave) {
    const isLocked = Boolean(curTab?._isLocked);
    const isDraft = Boolean(!curTab?.filePath);
    const isDirty = Boolean(curTab?.isDirty);
    const canSave = (isDraft || isDirty) && !isLocked;

    btnSave.disabled = !canSave;
    btnSave.classList.toggle("is-dirty", canSave);
    btnSave.classList.toggle("is-saved", !canSave);

    let btnText = "已保存";
    let btnTitle = "当前文件已全部同步保存至本地";
    if (isDraft) {
      btnText = "保存";
      btnTitle = "当前为本地草稿，点击立即保存 (⌘S / Ctrl+S)";
    } else if (isDirty) {
      btnText = "保存";
      btnTitle = "有未保存的修改，点击保存 (⌘S / Ctrl+S)";
    }
    btnSave.title = btnTitle;
    btnSave.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg>
      <span>${btnText}</span>
      ${canSave ? `<span class="save-btn-dirty-dot"></span>` : ""}
    `;
  }

  const activeIds = new Set(state.tabs.map(t => t.id));
  Array.from(tabList.children).forEach(child => {
    if (!activeIds.has(child.dataset.tabId)) child.remove();
  });

  state.tabs.forEach((t) => {
    const displayName = getTabDisplayFilename(t);
    const isDraft = !t.filePath;
    const isActive = t.id === state.activeTabId;

    let item = tabList.querySelector(`[data-tab-id="${t.id}"]`);
    if (!item) {
      item = document.createElement("div");
      item.dataset.tabId = t.id;
      tabList.appendChild(item);
    }

    item.className = `apple-tab-item ${isActive ? "active" : ""} ${t.isDirty || isDraft ? "is-dirty" : ""}`;
    item.title = `${isDraft ? "[草稿] " : ""}${displayName}`;

    const dirtyDot = (t.isDirty || isDraft) ? `<span class="tab-dirty-indicator"></span>` : "";
    const lockIcon = t.isEncrypted ? `<span style="font-size:10px;margin-right:2px;">🔒</span>` : "";

    const safeDisplayName = String(displayName).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    // 🌟 BUG-07 防御：对 tab.id 转义，阻断关闭按钮 data-close-id 逃逸
    const safeTabId = String(t.id).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    const nextContentKey = `${Boolean(t.isDirty || isDraft)}_${Boolean(t.isEncrypted)}_${safeDisplayName}`;
    if (item._contentKey !== nextContentKey) {
      item._contentKey = nextContentKey;
      item.innerHTML = `
        ${dirtyDot}
        ${lockIcon}
        <span class="tab-title-text">${safeDisplayName}</span>
        <span class="tab-close-btn" data-close-id="${safeTabId}" title="关闭标签页">✕</span>
      `;
    }
  });

  const activeDom = tabList.querySelector(".apple-tab-item.active");
  if (activeDom && tabList._lastScrolledTabId !== state.activeTabId) {
    tabList._lastScrolledTabId = state.activeTabId;
    const tRect = activeDom.getBoundingClientRect();
    const lRect = tabList.getBoundingClientRect();
    if (tRect.left < lRect.left || tRect.right > lRect.right) {
      activeDom.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
    }
  }
}

export function initTabBar(renderApp, showHome) {
  const tabContextMenu = document.getElementById("apple-tab-context-menu");
  const tabBar = document.getElementById("apple-tab-bar");

  window.addEventListener("click", (e) => {
    if (tabContextMenu && !tabContextMenu.contains(e.target)) hideTabContextMenu();
  });

  const hideTabContextMenu = () => {
    if (tabContextMenu) {
      tabContextMenu.classList.add("hidden");
      tabContextMenu.style.display = "none";
    }
  };

  // 🌟 VS Code 风格：右键标签项或标签栏空白区域唤起上下文管理菜单
  tabBar?.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".tab-add-btn")) return;
    e.preventDefault();
    e.stopPropagation();
    if (!tabContextMenu) return;

    const item = e.target.closest(".apple-tab-item");
    // VS Code 体验对齐：若右击非当前活动标签，先行切换激活该标签
    if (item?.dataset?.tabId && item.dataset.tabId !== state.activeTabId) {
      activateTab(item.dataset.tabId);
    }

    tabContextMenuTargetId = item ? item.dataset.tabId : state.activeTabId;

    const itemSpecificElements = tabContextMenu.querySelectorAll(
      '[data-tab-menu="close-current"], [data-tab-menu="close-others"], [data-tab-menu="close-right"], .tab-item-separator'
    );
    itemSpecificElements.forEach(el => {
      el.style.display = item ? "" : "none";
    });

    let posX = e.clientX;
    let posY = e.clientY + 6;
    if (posX + 190 > window.innerWidth) posX = window.innerWidth - 200;
    if (posY + 160 > window.innerHeight) posY = window.innerHeight - 170;

    tabContextMenu.style.left = `${posX}px`;
    tabContextMenu.style.top = `${posY}px`;
    tabContextMenu.style.display = "block";
    tabContextMenu.classList.remove("hidden");
  });

  window.addEventListener("contextmenu", (e) => {
    if (tabContextMenu && !tabContextMenu.contains(e.target) && !e.target.closest("#apple-tab-bar")) {
      hideTabContextMenu();
    }
  });

  tabContextMenu?.querySelectorAll("[data-tab-menu]").forEach(item => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      const action = item.dataset.tabMenu;
      const targetId = tabContextMenuTargetId || state.activeTabId;

      if (action === "close-current") await closeTabWithConfirm(targetId, renderApp, showHome);
      else if (action === "close-others") await closeOtherTabsWithConfirm(targetId);
      else if (action === "close-right") await closeTabsToRightWithConfirm(targetId);
      else if (action === "close-all") await closeAllTabsWithConfirm();
    });
  });

  if (!isTabDelegationBound && tabList) {
    // 🌟 按下鼠标瞬间（pointerdown）立即响应，消除 click 等待松手的 150ms 延迟
    tabList.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("[data-close-id]")) return;
      const item = e.target.closest(".apple-tab-item");
      if (!item) return;
      const tabId = item.dataset.tabId;
      if (!tabId || tabId === state.activeTabId) return;
      activateTab(tabId);
    });

    tabList.addEventListener("click", async (e) => {
      const closeBtn = e.target.closest("[data-close-id]");
      if (closeBtn) {
        e.stopPropagation();
        await closeTabWithConfirm(closeBtn.dataset.closeId, renderApp, showHome);
      }
    });
    isTabDelegationBound = true;
  }

  document.getElementById("btn-add-tab")?.addEventListener("click", () => {
    closeNotesDrawer();
    const newTab = createNewTab(); // 智能分配 未命名 1 / 未命名 2
    newTab.filePath = null; // 方案 B：未落盘草稿严禁写入最近物理文档
    newTab.isDirty = true;
    hideLockScreenDOM();
    renderTabBar();
    bus.emit(EVENTS.RENDER_APP);
    syncInspectorUi();
    updateSecurityDockStatus();
    smartCenterOnSelectedNode(state, false);
  });

  tabBar?.addEventListener("wheel", (e) => {
    if (tabList && e.deltaY !== 0 && !e.target.closest(".tab-action-group")) {
      e.preventDefault();
      tabList.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

let tabContextMenuTargetId = null;

function destroyTabResources(t) {
  if (!t) return;
  if (t._context) {
    t._context.dispose();
    t._context = null;
  }
  if (t.spatialIndex) {
    t.spatialIndex.clear();
    t.spatialIndex = null;
  }
  if (t.mindData) {
    deepSeverTree(t.mindData);
    t.mindData = null;
  }
  t.selectedIds?.clear();
  t.historyStack = [];
  t.versions = [];
  delete t.history;
  t.camera = null;
}

export async function closeMultipleTabsWithConfirm(targetTabIds, preferredActiveId = null) {
  if (!Array.isArray(targetTabIds) || targetTabIds.length === 0) return;
  const toCloseTabs = state.tabs.filter(t => targetTabIds.includes(t.id));
  if (toCloseTabs.length === 0) return;

  // 检查是否有未保存的脏文档或未落盘草稿
  const dirtyTabs = toCloseTabs.filter(t => t.isDirty || !t.filePath);
  if (dirtyTabs.length > 0) {
    const ok = await appConfirm({
      title: `批量关闭 ${toCloseTabs.length} 个标签页`,
      message: `其中有 ${dirtyTabs.length} 个文档包含未保存的修改（如「${dirtyTabs[0].title}」等）。确定要全部关闭吗？未保存的内容将被舍弃。`,
      isDanger: true,
      confirmText: "确认全部关闭",
      cancelText: "取消"
    });
    if (!ok) return;
  }

  closeNotesDrawer();

  const closeSet = new Set(targetTabIds);
  toCloseTabs.forEach(destroyTabResources);
  state.tabs = state.tabs.filter(t => !closeSet.has(t.id));

  if (state.tabs.length === 0) {
    state.activeTabId = null;
    saveSessionImmediate();
    bus.emit(EVENTS.SHOW_HOME);
    return;
  }

  // 自动落入最贴合的活跃标签页
  if (!state.tabs.some(t => t.id === state.activeTabId)) {
    state.activeTabId = (preferredActiveId && state.tabs.some(t => t.id === preferredActiveId))
      ? preferredActiveId
      : state.tabs[state.tabs.length - 1].id;
  }

  state.isLayoutDirty = true;
  saveSessionImmediate();

  const cur = getActiveTab();
  if (cur) {
    camera.transform = { ...cur.camera };
    applyCanvasThemeToBody(cur.canvasBgColor || "studio-white", cur.canvasBgPattern || "dots");
    if (cur.isEncrypted && cur._isLocked) showLockScreen(cur);
    else hideLockScreenDOM();
  }

  renderTabBar();
  bus.emit(EVENTS.RENDER_APP);
  syncInspectorUi();
  updateSecurityDockStatus();
  showToast(`🗑️ 已关闭 ${toCloseTabs.length} 个标签页`);
}

export async function closeOtherTabsWithConfirm(keepTabId = null) {
  const targetId = keepTabId || state.activeTabId;
  const toClose = state.tabs.filter(t => t.id !== targetId).map(t => t.id);
  await closeMultipleTabsWithConfirm(toClose, targetId);
}

export async function closeTabsToRightWithConfirm(fromTabId = null) {
  const targetId = fromTabId || state.activeTabId;
  const idx = state.tabs.findIndex(t => t.id === targetId);
  if (idx === -1 || idx >= state.tabs.length - 1) {
    showToast("右侧无更多标签页");
    return;
  }
  const toClose = state.tabs.slice(idx + 1).map(t => t.id);
  await closeMultipleTabsWithConfirm(toClose, targetId);
}

export async function closeAllTabsWithConfirm() {
  const toClose = state.tabs.map(t => t.id);
  await closeMultipleTabsWithConfirm(toClose, null);
}
