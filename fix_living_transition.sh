#!/usr/bin/env bash
set -euo pipefail

test -f "./src/css/home.css"
test -f "./src/css/workspace.css"
test -f "./src/main.js"

python3 - <<'PY'
from pathlib import Path

# 1. 升级 home.css: 支持绝对定位层叠与生动景深转场关键帧
home_css_path = Path("./src/css/home.css")
home_css = home_css_path.read_text(encoding="utf-8")

old_home_rule = ".home-view { display: flex; width: 100vw; height: 100vh; background: #f1f5f9; z-index: 10; position: relative; }"
new_home_rule = """.home-view { 
  display: flex; 
  width: 100vw; 
  height: 100vh; 
  background: #f1f5f9; 
  z-index: 10; 
  position: absolute; 
  inset: 0;
  will-change: transform, opacity, filter;
}

/* 🌟 首页生动景深视差转场体系 */
.home-view.home-enter-active {
  animation: homeLivingEnter 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: auto;
}
.home-view.home-leave-active {
  animation: homeLivingLeave 0.26s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  pointer-events: none;
}

@keyframes homeLivingEnter {
  0% {
    opacity: 0;
    transform: scale(0.965) translateY(10px);
    filter: blur(6px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
}

@keyframes homeLivingLeave {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: scale(0.965) translateY(10px);
    filter: blur(6px);
  }
}"""

if old_home_rule not in home_css:
    raise SystemExit("failed to match old_home_rule in home.css")
home_css = home_css.replace(old_home_rule, new_home_rule, 1)
home_css_path.write_text(home_css, encoding="utf-8")

# 2. 升级 workspace.css: 工作区绝对定位层叠与推入/抽出微弹性动画
ws_css_path = Path("./src/css/workspace.css")
ws_css = ws_css_path.read_text(encoding="utf-8")

old_ws_rule = """.workspace-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
  position: relative;
}"""

new_ws_rule = """.workspace-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
  position: absolute;
  inset: 0;
  z-index: 20;
  will-change: transform, opacity, filter;
}

/* 🌟 工作区微距景深推入/抽出转场 */
.workspace-view.workspace-enter-active {
  animation: workspaceLivingEnter 0.34s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: auto;
}
.workspace-view.workspace-leave-active {
  animation: workspaceLivingLeave 0.28s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  pointer-events: none;
}

@keyframes workspaceLivingEnter {
  0% {
    opacity: 0;
    transform: scale(1.028) translateY(-6px);
    filter: blur(8px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
}

@keyframes workspaceLivingLeave {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: scale(1.025) translateY(-6px);
    filter: blur(8px);
  }
}"""

if old_ws_rule not in ws_css:
    raise SystemExit("failed to match old_ws_rule in workspace.css")
ws_css = ws_css.replace(old_ws_rule, new_ws_rule, 1)
ws_css_path.write_text(ws_css, encoding="utf-8")

# 3. 升级 main.js: 调度 showWorkspace / showHome 动效编排管理并保护冷启动
main_js_path = Path("./src/main.js")
main_js = main_js_path.read_text(encoding="utf-8")

old_show_funcs = """export function showWorkspace() {
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

  // 🌟 解决首帧穿模飞线：等待容器完成真实 DOM 重排后再进行几何布局与排版
  requestAnimationFrame(() => {
    const vp = document.getElementById("viewport");
    if (!vp || vp.clientWidth <= 0) return;

    resizeCanvas(true);
    const docCtx = getActiveDocumentContext();
    if (docCtx) {
      docCtx.isLayoutDirty = true;
    }
    renderApp();

    import("./js/core/camera.js").then(cam => {
      cam.smartAdaptiveCenter(null, false, docCtx);
    });

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
}"""

new_show_funcs = """let viewTransitionTimer = null;

export function showWorkspace(animated = true) {
  if (state.tabs.length === 0) createNewTab();
  if (viewTransitionTimer) {
    clearTimeout(viewTransitionTimer);
    viewTransitionTimer = null;
  }

  if (animated && homeView && !homeView.classList.contains("hidden") && workspaceView) {
    workspaceView.classList.remove("hidden", "workspace-leave-active");
    homeView.classList.remove("home-enter-active");

    workspaceView.classList.add("workspace-enter-active");
    homeView.classList.add("home-leave-active");

    viewTransitionTimer = setTimeout(() => {
      homeView?.classList.add("hidden");
      homeView?.classList.remove("home-leave-active");
      workspaceView?.classList.remove("workspace-enter-active");
      viewTransitionTimer = null;
    }, 320);
  } else {
    if (homeView) homeView.classList.add("hidden");
    if (workspaceView) workspaceView.classList.remove("hidden");
  }

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

  // 🌟 解决首帧穿模飞线：等待容器完成真实 DOM 重排后再进行几何布局与排版
  requestAnimationFrame(() => {
    const vp = document.getElementById("viewport");
    if (!vp || vp.clientWidth <= 0) return;

    resizeCanvas(true);
    const docCtx = getActiveDocumentContext();
    if (docCtx) {
      docCtx.isLayoutDirty = true;
    }
    renderApp();

    import("./js/core/camera.js").then(cam => {
      cam.smartAdaptiveCenter(null, false, docCtx);
    });

    import("./js/render/minimap.js").then(m => {
      m.updateMinimap();
      m.syncMinimapViewportBox();
    });
  });
  syncInspectorUi();
  updateSecurityDockStatus();
}

export function showHome(animated = true) {
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

  if (viewTransitionTimer) {
    clearTimeout(viewTransitionTimer);
    viewTransitionTimer = null;
  }

  if (animated && workspaceView && !workspaceView.classList.contains("hidden") && homeView) {
    homeView.classList.remove("hidden", "home-leave-active");
    workspaceView.classList.remove("workspace-enter-active");

    homeView.classList.add("home-enter-active");
    workspaceView.classList.add("workspace-leave-active");

    viewTransitionTimer = setTimeout(() => {
      workspaceView?.classList.add("hidden");
      workspaceView?.classList.remove("workspace-leave-active");
      homeView?.classList.remove("home-enter-active");
      viewTransitionTimer = null;
    }, 280);
  } else {
    if (workspaceView) workspaceView.classList.add("hidden");
    if (homeView) homeView.classList.remove("hidden");
  }

  renderHomeHub(renderApp, showWorkspace);
}"""

if old_show_funcs not in main_js:
    raise SystemExit("failed to match showWorkspace/showHome in main.js")
main_js = main_js.replace(old_show_funcs, new_show_funcs, 1)

# 冷启动默认无动效直出，保证启动性能
old_boot_call = "  showHome();"
new_boot_call = "  showHome(false);"
if old_boot_call in main_js:
    main_js = main_js.replace(old_boot_call, new_boot_call, 1)

main_js_path.write_text(main_js, encoding="utf-8")
print("TRANSITION PATCH APPLIED OK")
PY

echo "FIX OK"
