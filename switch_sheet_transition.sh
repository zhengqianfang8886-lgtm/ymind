#!/usr/bin/env bash
set -euo pipefail

test -f "./src/css/home.css"
test -f "./src/css/workspace.css"
test -f "./src/main.js"

python3 - <<'PY'
from pathlib import Path
import re

# 1. 升级 home.css: 首页拟物基座压深与回弹
home_css_path = Path("./src/css/home.css")
home_css = home_css_path.read_text(encoding="utf-8")

old_home_block_pattern = r'/\* 🌟 首页生动景深视差转场体系 \*/[\s\S]*?@keyframes homeLivingLeave \{[\s\S]*?\}'
new_home_block = """/* 🌟 首页拟物基座沉浮体系 (Desk Base Physics) */
.home-view.home-receding {
  animation: homeRecedeBase 0.36s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: none;
}
.home-view.home-restoring {
  animation: homeRestoreBase 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: auto;
}

@keyframes homeRecedeBase {
  0% {
    transform: scale(1) translateY(0);
    opacity: 1;
    filter: brightness(1);
    border-radius: 0;
  }
  100% {
    transform: scale(0.945) translateY(-12px);
    opacity: 0.28;
    filter: brightness(0.9);
    border-radius: 20px;
  }
}

@keyframes homeRestoreBase {
  0% {
    transform: scale(0.945) translateY(-12px);
    opacity: 0.28;
    filter: brightness(0.9);
    border-radius: 20px;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
    filter: brightness(1);
    border-radius: 0;
  }
}"""

if re.search(old_home_block_pattern, home_css):
    home_css = re.sub(old_home_block_pattern, new_home_block, home_css)
    home_css_path.write_text(home_css, encoding="utf-8")

# 2. 升级 workspace.css: 工作区拟物超椭圆画布升起吸附与沉降收纳
ws_css_path = Path("./src/css/workspace.css")
ws_css = ws_css_path.read_text(encoding="utf-8")

old_ws_block_pattern = r'/\* 🌟 工作区微距景深推入/抽出转场 \*/[\s\S]*?@keyframes workspaceLivingLeave \{[\s\S]*?\}'
new_ws_block = """/* 🌟 工作区拟物超椭圆画布升降展开 (Sheet Emerge Physics) */
.workspace-view.workspace-sheet-enter {
  animation: workspaceSheetEnter 0.38s cubic-bezier(0.16, 1, 0.28, 1.02) forwards;
  pointer-events: auto;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.26);
}
.workspace-view.workspace-sheet-leave {
  animation: workspaceSheetLeave 0.28s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  pointer-events: none;
}

@keyframes workspaceSheetEnter {
  0% {
    opacity: 0;
    transform: translateY(52px) scale(0.965);
    border-radius: 26px;
  }
  75% {
    opacity: 1;
    transform: translateY(-2px) scale(1.002);
    border-radius: 6px;
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    border-radius: 0;
    box-shadow: none;
  }
}

@keyframes workspaceSheetLeave {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    border-radius: 0;
  }
  100% {
    opacity: 0;
    transform: translateY(42px) scale(0.965);
    border-radius: 22px;
  }
}"""

if re.search(old_ws_block_pattern, ws_css):
    ws_css = re.sub(old_ws_block_pattern, new_ws_block, ws_css)
    ws_css_path.write_text(ws_css, encoding="utf-8")

# 3. 升级 main.js: 调度升降进出场 class
main_js_path = Path("./src/main.js")
main_js = main_js_path.read_text(encoding="utf-8")

# 替换 showWorkspace 中的动效 class
main_js = main_js.replace("workspace-leave-active", "workspace-sheet-leave")
main_js = main_js.replace("home-enter-active", "home-restoring")
main_js = main_js.replace("workspace-enter-active", "workspace-sheet-enter")
main_js = main_js.replace("home-leave-active", "home-receding")

# 替换 showHome 中的动效 class
main_js = main_js.replace("workspace-sheet-enter", "workspace-sheet-enter")
main_js = main_js.replace("home-receding", "home-receding")

main_js_path.write_text(main_js, encoding="utf-8")
print("TACTILE SHEET TRANSITION APPLIED OK")
PY

echo "FIX OK"
