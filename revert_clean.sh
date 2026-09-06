#!/usr/bin/env bash
set -euo pipefail

test -f "./src/css/home.css"
test -f "./src/css/workspace.css"
test -f "./src/main.js"

python3 - <<'PY'
from pathlib import Path
import re

# 1. 恢复 home.css: 彻底还原为干净的 position: relative，去除动画及 will-change
home_css_path = Path("./src/css/home.css")
home_css = home_css_path.read_text(encoding="utf-8")

# 清理动画与定位
home_css = re.sub(
    r'\.home-view\s*\{[^}]*\}',
    '.home-view { display: flex; width: 100vw; height: 100vh; background: #f1f5f9; z-index: 10; position: relative; }',
    home_css
)
home_css = re.sub(r'/\* 🌟 首页拟物基座沉浮体系[\s\S]*?@keyframes homeRestoreBase\s*\{[\s\S]*?\}', '', home_css)
home_css = re.sub(r'/\* 🌟 首页生动景深视差转场体系[\s\S]*?@keyframes homeLivingLeave\s*\{[\s\S]*?\}', '', home_css)
home_css_path.write_text(home_css.strip() + "\n", encoding="utf-8")

# 2. 恢复 workspace.css: 彻底还原为纯净的 position: relative，彻底恢复 fixed 参照系
ws_css_path = Path("./src/css/workspace.css")
ws_css = ws_css_path.read_text(encoding="utf-8")

ws_clean_rule = """.workspace-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
  position: relative;
}"""
ws_css = re.sub(r'\.workspace-view\s*\{[^}]*\}', ws_clean_rule, ws_css)
ws_css = re.sub(r'/\* 🌟 工作区拟物超椭圆画布升降展开[\s\S]*?@keyframes workspaceSheetLeave\s*\{[\s\S]*?\}', '', ws_css)
ws_css = re.sub(r'/\* 🌟 工作区微距景深推入/抽出转场[\s\S]*?@keyframes workspaceLivingLeave\s*\{[\s\S]*?\}', '', ws_css)
ws_css_path.write_text(ws_css.strip() + "\n", encoding="utf-8")

# 3. 恢复 main.js: 彻底移除延迟定时器与动效 class，恢复即时无副作用切换与原始相机视角
main_js_path = Path("./src/main.js")
main_js = main_js_path.read_text(encoding="utf-8")

clean_show_funcs = """export function showWorkspace() {
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
}"""

# 匹配并替换 showWorkspace / showHome 整块逻辑
main_js = re.sub(
    r'(?:let viewTransitionTimer = null;\s*)?export function showWorkspace\([\s\S]*?renderHomeHub\(renderApp, showWorkspace\);\s*\}',
    clean_show_funcs,
    main_js
)

# 确保启动静默
main_js = main_js.replace("showHome(false);", "showHome();")
main_js_path.write_text(main_js, encoding="utf-8")

print("REVERT OK - INTERFACE RESTORED")
PY

echo "FIX OK"
