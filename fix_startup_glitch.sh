#!/usr/bin/env bash
set -euo pipefail

FILE="./src/main.js"
test -f "$FILE"

python3 - "$FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

old_code = """  resizeCanvas(true);
  renderApp();
  requestAnimationFrame(() => {
    resizeCanvas(true);
    renderApp();
    import("./js/render/minimap.js").then(m => {
      m.updateMinimap();
      m.syncMinimapViewportBox();
    });
  });"""

new_code = """  // 🌟 解决首帧穿模飞线：等待容器完成真实 DOM 重排后再进行几何布局与排版
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
  });"""

if text.count(old_code) != 1:
    raise SystemExit(f"expected 1 match for showWorkspace render sequence, got {text.count(old_code)}")

text = text.replace(old_code, new_code)
path.write_text(text, encoding="utf-8")
PY

echo "FIX OK"
