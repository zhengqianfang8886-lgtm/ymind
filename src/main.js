import { checkForUpdates } from "./js/ui/updater.js";
import { isApplePlatform } from "./js/interaction/shortcuts.js";
import { state, getActiveTab, createNewTab, getActiveDocumentContext } from "./js/core/state.js";
import { getGlobalSettings, saveGlobalSettings, applyAppTheme } from "./js/core/config.js";
import { render, resizeCanvas, syncInlineEditorPosition } from "./js/render/render.js";
import { renderOutliner } from "./js/render/outliner.js";
import { camera, requestTransformUpdate, locateFocusedNode, stopAllCameraAnimations } from "./js/core/camera.js";
import { initEventListeners, updateSelectionOnly } from "./js/ui/events.js";
import { syncInspectorUi, applyCanvasThemeToBody, initInspectorEvents } from "./js/ui/inspector.js";
import { renderHomeHub, initHomeEvents, recordRecentDoc, switchHomeTab } from "./js/ui/home.js";
import { renderTabBar, initTabBar } from "./js/core/tab-manager.js";
import { initNotesDrawer, closeNotesDrawer, syncNotesDrawerWithActiveNode } from "./js/ui/notes.js";
import { initFlashcards, toggleRecallMode, openFlashcardModal } from "./js/ui/flashcards.js";
import { initVaultManager, showLockScreen, hideLockScreen, updateSecurityDockStatus } from "./js/ui/vault.js";
import { initContextMenu } from "./js/ui/contextmenu.js";
import { initSearchEngine } from "./js/ui/search.js";
import { initIconPicker } from "./js/ui/icon-picker.js";
import { initAutoSaveEngine, openVersionHistoryModal, closeVersionHistoryModal, clearAllSnapshots, renderHistoryList, createVersionSnapshot } from "./js/storage/storage.js";
import { initSettingsViewEvents } from "./js/ui/settings.js";
import { appConfirm, showToast } from "./js/ui/dialog.js";
import { bus, EVENTS } from "./js/core/event-bus.js";
import { initMinimap, syncMinimapViewportBox } from "./js/render/minimap.js";
import { restoreSession, saveSessionImmediate, saveSessionSyncFallback } from "./js/storage/session.js";

const homeView = document.getElementById("home-view");
const workspaceView = document.getElementById("workspace-view");

export function toggleAppTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "dark" ? "light" : "dark";
  const s = getGlobalSettings();
  s.appTheme = next;
  saveGlobalSettings(s);
  applyAppTheme(next);
  bus.emit(EVENTS.RENDER_APP);
  showToast(next === "dark" ? "🌙 已切换为深色黑曜模式" : "☀️ 已切换为浅色明亮模式");
}

export function showWorkspace() {
  stopAllCameraAnimations();
  if (state.tabs.length === 0) createNewTab();
  if (homeView) homeView.classList.add("hidden");
  if (workspaceView) workspaceView.classList.remove("hidden");
  document.querySelector(".workspace-body-layout")?.classList.toggle("sidebar-open", !document.getElementById("format-sidebar")?.classList.contains("collapsed"));

  const cur = getActiveTab();
  if (cur) {
    if (cur.camera && cur.camera.scale) {
      camera.transform.x = cur.camera.x;
      camera.transform.y = cur.camera.y;
      camera.transform.scale = cur.camera.scale;
    }
    applyCanvasThemeToBody(cur.canvasBgColor || "studio-white", cur.canvasBgPattern || "dots");
    if (cur.isEncrypted && cur._isLocked) {
      showLockScreen(cur);
    } else {
      hideLockScreen();
    }
  }

  resizeCanvas(true);
  renderApp();
  requestAnimationFrame(() => {
    resizeCanvas(true);
    renderApp();
    import("./js/render/minimap.js").then(m => {
      m.updateMinimap();
      m.syncMinimapViewportBox();
    });
  });
  syncInspectorUi();
  updateSecurityDockStatus();
}

export function showHome() {
  const minimapBox = document.getElementById("minimap-viewport-box");
  if (minimapBox) minimapBox.style.display = "none";
  const cur = getActiveTab();
  if (cur) {
    cur.camera = { ...camera.transform };
    if (!cur._isLocked && cur.filePath) {
      recordRecentDoc(cur.title, cur.mindData, cur.layoutStructure, cur.filePath, {
        colorPalette: cur.colorPalette,
        lineStyle: cur.lineStyle,
        boxStyle: cur.boxStyle,
        canvasBgColor: cur.canvasBgColor,
        canvasBgPattern: cur.canvasBgPattern
      }, cur.isEncrypted, cur.camera);
    }
  }
  hideLockScreen();
  closeNotesDrawer();

  if (workspaceView) workspaceView.classList.add("hidden");
  if (homeView) homeView.classList.remove("hidden");
  renderHomeHub(renderApp, showWorkspace);
}

function renderApp() {
  try {
    if (state.tabs.length === 0) { showHome(); return; }

    renderTabBar();

    const curTab = getActiveTab();
    const viewport = document.getElementById("viewport");
    const outlinerView = document.getElementById("outliner-view");
    const btnMind = document.getElementById("btn-mode-mindmap");
    const btnOut = document.getElementById("btn-mode-outliner");

    if (curTab?.isEncrypted && curTab?._isLocked) {
      outlinerView?.classList.add("hidden");
      viewport?.classList.remove("hidden");
      closeNotesDrawer();
      if (viewport) {
        const c = document.getElementById("canvas-main");
        if (c) {
          const cx = c.getContext("2d");
          if (cx) cx.clearRect(0, 0, c.width, c.height);
        }
      }
      showLockScreen(curTab);
      return;
    }

    const docCtx = getActiveDocumentContext();
    if (curTab?.viewMode === "outliner") {
      viewport?.classList.add("hidden");
      outlinerView?.classList.remove("hidden");
      btnMind?.classList.remove("active-mode");
      btnOut?.classList.add("active-mode");
      closeNotesDrawer();
      renderOutliner(renderApp);
    } else {
      outlinerView?.classList.add("hidden");
      viewport?.classList.remove("hidden");
      btnOut?.classList.remove("active-mode");
      btnMind?.classList.add("active-mode");
      render(docCtx, {
        onRender: renderApp,
        onSelect: (id) => {
          docCtx?.selectNode(id);
          updateSelectionOnly();
          syncInspectorUi();
          locateFocusedNode(id, true, docCtx);
          syncNotesDrawerWithActiveNode();
        },
        onRequestTransform: requestTransformUpdate
      });
    }
  } catch (err) {
    console.error("[YMind Critical Render Error]", err);
    state.isLayoutDirty = true;
    showToast("⚠️ 界面渲染发生异常，已重置拓扑缓存");
  }
}

function renderCanvasOnly() {
  if (state.viewMode === "outliner" || state.tabs.length === 0) return;
  const curTab = getActiveTab();
  if (curTab?.isEncrypted && curTab?._isLocked) return;
  const docCtx = getActiveDocumentContext();
  if (!docCtx) return;

  render(docCtx, {
    onRender: renderApp,
    onSelect: (id) => {
      docCtx.selectNode(id);
      updateSelectionOnly();
      syncInspectorUi(docCtx);
      locateFocusedNode(id, true, docCtx);
      syncNotesDrawerWithActiveNode();
    },
    onRequestTransform: requestTransformUpdate
  });
}

let renderBatchRafId = null;
function scheduleRenderApp() {
  if (renderBatchRafId) return;
  renderBatchRafId = requestAnimationFrame(() => {
    renderBatchRafId = null;
    renderApp();
  });
}

bus.on(EVENTS.RENDER_APP, scheduleRenderApp);
bus.on(EVENTS.RENDER_CANVAS_ONLY, renderCanvasOnly);
bus.on(EVENTS.SHOW_WORKSPACE, showWorkspace);
bus.on(EVENTS.SHOW_HOME, showHome);
bus.on(EVENTS.SYNC_VAULT_UI, updateSecurityDockStatus);

bus.on(EVENTS.TRANSFORM_CHANGE, (transform) => {
  syncMinimapViewportBox();
  syncInlineEditorPosition();
  const zt = document.getElementById("txt-zoom-level");
  if (zt) zt.innerText = `${Math.round(transform.scale * 100)}%`;
});

document.getElementById("btn-back-home")?.addEventListener("click", showHome);
// 🌟 深度打磨：导图 ↔ 大纲空间连贯性切换与焦点无缝交接
document.getElementById("btn-mode-mindmap")?.addEventListener("click", async () => {
  const t = getActiveTab();
  if (!t || t.viewMode === "mindmap") return;

  // 拾取大纲当前焦点节点，反向同步至导图选中态
  const activeRow = document.activeElement?.closest?.(".outliner-row");
  const targetId = activeRow?.dataset?.id || t._lastFocusedId;
  const docCtx = getActiveDocumentContext();
  if (targetId && docCtx) {
    docCtx.selectNode(targetId);
  }

  t.viewMode = "mindmap";
  const vp = document.getElementById("viewport");
  if (vp) {
    vp.classList.remove("view-fade-in");
    void vp.offsetWidth;
    vp.classList.add("view-fade-in");
  }

  resizeCanvas(true);
  renderApp();

  // 相机启动 Apple 弹簧曲线平滑推镜回正
  const { smartAdaptiveCenter } = await import("./js/core/camera.js");
  const targetNode = targetId && docCtx ? (findNode(targetId, docCtx.mindData) || null) : null;
  smartAdaptiveCenter(targetNode, true, docCtx);

  requestAnimationFrame(() => {
    import("./js/render/minimap.js").then(m => {
      m.updateMinimap();
      m.syncMinimapViewportBox();
    });
  });
});

document.getElementById("btn-mode-outliner")?.addEventListener("click", () => {
  const t = getActiveTab();
  if (!t || t._isLocked || t.viewMode === "outliner") return;
  closeNotesDrawer();

  // 捕获导图当前选中的节点作为大纲直达目标
  const docCtx = getActiveDocumentContext();
  const activeNodeId = docCtx?.primarySelectedNode?.id;
  if (activeNodeId) t._lastFocusedId = activeNodeId;

  t.viewMode = "outliner";
  const outlinerView = document.getElementById("outliner-view");
  if (outlinerView) {
    outlinerView.classList.remove("view-fade-in");
    void outlinerView.offsetWidth;
    outlinerView.classList.add("view-fade-in");
  }

  requestAnimationFrame(() => {
    renderApp();
  });
});
document.getElementById("btn-export-snap")?.addEventListener("click", () => {
  import("./js/ui/snapshot.js").then(m => m.openSnapshotModal());
});
document.getElementById("btn-mode-flashcards")?.addEventListener("click", () => {
  const t = getActiveTab();
  if (t?.isEncrypted && t?._isLocked) return;
  closeNotesDrawer();
  openFlashcardModal();
});
document.getElementById("btn-active-recall")?.addEventListener("click", () => {
  const t = getActiveTab();
  if (t?.isEncrypted && t?._isLocked) return;
  toggleRecallMode(renderApp);
});

document.getElementById("btn-open-settings")?.addEventListener("click", () => {
  closeNotesDrawer();
  showHome();
  switchHomeTab("settings", renderApp, showWorkspace);
});

document.getElementById("btn-open-history")?.addEventListener("click", () => {
  closeNotesDrawer();
  openVersionHistoryModal(renderApp);
});
document.getElementById("nav-btn-history")?.addEventListener("click", () => {
  closeNotesDrawer();
  openVersionHistoryModal(renderApp);
});

document.getElementById("btn-create-manual-snap")?.addEventListener("click", () => {
  const cur = getActiveTab();
  if (cur && !cur._isLocked) {
    createVersionSnapshot(cur, "manual");
    renderHistoryList(document.getElementById("history-search-input")?.value || "", renderApp);
    showToast("📸 当前版本快照已拍摄保存");
  }
});
document.getElementById("btn-history-clear-all")?.addEventListener("click", async () => {
  const ok = await appConfirm({
    title: "彻底粉碎快照库",
    message: "确定要永久清空所有历史版本快照吗？此操作无法撤销！",
    isDanger: true,
    confirmText: "立即彻底粉碎"
  });
  if (ok) {
    clearAllSnapshots();
    renderHistoryList("", renderApp);
    showToast("🗑️ 所有历史快照已被永久粉碎");
  }
});
document.getElementById("history-search-input")?.addEventListener("input", (e) => {
  renderHistoryList(e.target.value, renderApp);
});

async function setupTauriExitProtection() {
  try {
    const tauriWindow = window.__TAURI__?.window?.getCurrentWindow?.() || window.__TAURI__?.window?.appWindow;
    if (!tauriWindow || typeof tauriWindow.onCloseRequested !== "function") return;
    let isHandled = false;
    await tauriWindow.onCloseRequested(async (event) => {
      if (isHandled) return;
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      isHandled = true;
      try {
        saveSessionSyncFallback();
        await saveSessionImmediate();
        for (const t of state.tabs) {
          if (!t._isLocked && t.mindData && t.filePath) {
            recordRecentDoc(t.title, t.mindData, t.layoutStructure, t.filePath, {
              colorPalette: t.colorPalette,
              lineStyle: t.lineStyle,
              boxStyle: t.boxStyle,
              canvasBgColor: t.canvasBgColor,
              canvasBgPattern: t.canvasBgPattern
            }, t.isEncrypted, t.camera);
          }
        }
      } catch (err) {}
      try {
        if (typeof tauriWindow.destroy === "function") {
          await tauriWindow.destroy();
        } else if (typeof tauriWindow.close === "function") {
          await tauriWindow.close();
        }
      } catch {}
    });
  } catch (err) {}
}
setupTauriExitProtection();

window.addEventListener("beforeunload", (e) => {
  try {
    saveSessionSyncFallback();
    for (const t of state.tabs) {
      if (!t._isLocked && t.mindData && t.filePath) {
        recordRecentDoc(t.title, t.mindData, t.layoutStructure, t.filePath, {
          colorPalette: t.colorPalette,
          lineStyle: t.lineStyle,
          boxStyle: t.boxStyle,
          canvasBgColor: t.canvasBgColor,
          canvasBgPattern: t.canvasBgPattern
        }, t.isEncrypted, t.camera);
      }
    }
  } catch (err) {}

  const hasUnsavedSecret = state.tabs.some(t => t.isEncrypted && t.isDirty && !t._isLocked);
  if (hasUnsavedSecret) {
    e.preventDefault();
    e.returnValue = "您有尚未保存至物理文件的加密保密文档，关闭后临时修改将加密暂存于本地会话中（下次需输入密码解锁），确定退出吗？";
    return e.returnValue;
  }
});

window.addEventListener("keydown", (e) => {
  const lockScreen = document.getElementById("canvas-vault-lock-screen");
  if (lockScreen && !lockScreen.classList.contains("hidden") && e.key === "Escape") {
    e.preventDefault();
    showHome();
    return;
  }
  if (homeView && !homeView.classList.contains("hidden") && e.key === "Escape" && state.tabs.length > 0) {
    e.preventDefault();
    showWorkspace();
  }
});

initTabBar(renderApp, showHome);
initMinimap();
initEventListeners(renderApp);
initHomeEvents(renderApp, showWorkspace);
initNotesDrawer();
initFlashcards(renderApp);
initVaultManager(renderApp);
initContextMenu(renderApp);
initSearchEngine(renderApp);
initIconPicker(renderApp);
initAutoSaveEngine(renderApp);
initSettingsViewEvents(renderApp);
initInspectorEvents();

document.getElementById("btn-theme-toggle")?.addEventListener("click", toggleAppTheme);
document.getElementById("btn-theme-toggle-home")?.addEventListener("click", toggleAppTheme);

(async () => {
  applyAppTheme();
  if (isApplePlatform()) {
    document.body.classList.add("platform-mac");
  }
  const hasRestored = await restoreSession();
  if (hasRestored && state.tabs.length > 0) {
    const cur = getActiveTab();
    if (cur) {
      camera.transform = { ...cur.camera };
      applyCanvasThemeToBody(cur.canvasBgColor || "studio-white", cur.canvasBgPattern || "dots");
    }
    renderTabBar();
    syncInspectorUi();
  }
  showHome();
  // 🌟 自动唤醒 WebView2 / WebKit 首帧合成，彻底消除启动黑屏
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 80);
  });
  setTimeout(() => {
    const s = getGlobalSettings();
    if (s.autoCheckUpdate !== false) checkForUpdates(false);
  }, 3500);
})();

if (typeof ResizeObserver !== "undefined") {
  const vpElement = document.getElementById("viewport");
  if (vpElement) {
    const ro = new ResizeObserver(() => {
      resizeCanvas(true);
      bus.emit(EVENTS.RENDER_APP);
    });
    ro.observe(vpElement);
  }
}

window.addEventListener("resize", () => {
  const ws = document.getElementById("workspace-view");
  if (ws && !ws.classList.contains("hidden")) {
    resizeCanvas(true);
    bus.emit(EVENTS.RENDER_APP);
  }
});

document.getElementById("btn-toggle-minimap")?.addEventListener("click", () => {
  const widget = document.getElementById("minimap-widget");
  const btn = document.getElementById("btn-toggle-minimap");
  if (!widget) return;
  const isHidden = widget.classList.toggle("hidden");
  btn?.classList.toggle("active", !isHidden);
  if (!isHidden) {
    requestAnimationFrame(() => {
      import("./js/render/minimap.js").then(m => {
        m.updateMinimap();
        m.syncMinimapViewportBox();
      });
    });
  }
});

const isDevMode = Boolean(
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) ||
  window.location.protocol === "http:" ||
  window.location.port !== "" ||
  localStorage.getItem("YMIND_DEV") === "1"
);

if (isDevMode) {
  import("./js/test/test-runner.js").then(({ runAllTests }) => {
    window.runYMindTests = () => runAllTests(renderApp);
    window.addEventListener("keydown", (e) => {
      const isT = e.code === "KeyT" || e.key.toLowerCase() === "t" || e.key === "†";
      if (e.altKey && isT) {
        e.preventDefault();
        runAllTests(renderApp);
      }
    });

    function mountDevTestButton() {
      const barRight = document.querySelector(".top-bar-right");
      if (barRight && !document.getElementById("btn-run-all-tests")) {
        const btn = document.createElement("button");
        btn.id = "btn-run-all-tests";
        btn.className = "dock-capsule-btn";
        btn.style.cssText = "border-color: rgba(0, 113, 227, 0.4); color: var(--apple-blue);";
        btn.title = "[本地开发专用] 启动全系统自动化回归测试 (Alt+T)";
        btn.innerHTML = `<span style="font-size:12px;">🧪</span><span>测试</span>`;
        btn.onclick = () => runAllTests(renderApp);
        barRight.prepend(btn);
      }
    }

    mountDevTestButton();
    bus.on(EVENTS.SHOW_WORKSPACE, () => setTimeout(mountDevTestButton, 50));
  }).catch(() => {});
}
