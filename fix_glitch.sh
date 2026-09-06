#!/usr/bin/env bash
set -euo pipefail

FILE="./src/js/render/render.js"
test -f "$FILE"

python3 - "$FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

# 1. 修复初次加载时误触发动画的问题：首次初始化直接对齐目标坐标，避免倒置
old_anim = """      if (n._rx === undefined) {
        if (parent && parent._rx !== undefined) {
          n._rx = parent._rx + (parent.width || 80) / 2;
          n._ry = parent._ry + (parent.height || 36) / 2;
        } else {
          n._rx = n.x;
          n._ry = n.y;
        }
        n._startX = n._rx;
        n._startY = n._ry;
        n._animStart = animNow;"""

new_anim = """      if (n._rx === undefined) {
        // 🌟 首次打开/渲染直接就位，严禁从中心点反向撕裂拉扯
        n._rx = n.x;
        n._ry = n.y;
        n._startX = n.x;
        n._startY = n.y;
        n._animStart = undefined;"""

# 2. 修复贝塞尔突触带在极小或反向距离下的自相交爆炸
old_ribbon = """    const tension = Math.max(Math.abs(dx) * 0.5, Math.min(Math.abs(dx) * 0.85, Math.abs(dy) * 0.28));
    const dir = Math.sign(dx) || 1;
    const cp1X = x1 + dir * tension;
    const cp2X = x2 - dir * tension;

    path.moveTo(x1, y1 - r1);
    path.bezierCurveTo(cp1X, y1 - r1, cp2X, y2 - r2, x2, y2 - r2);
    path.lineTo(x2, y2 + r2);
    path.bezierCurveTo(cp2X, y2 + r2, cp1X, y1 + r1, x1, y1 + r1);
    path.closePath();"""

new_ribbon = """    // 🌟 防翻转自交卫语句：若间距异常或几何反向，退化为安全连线，绝不产生全屏畸变扇面
    const isDirectionMismatch = isLeft ? (dx > -5) : (dx < 5);
    if (Math.abs(dx) < 8 || isDirectionMismatch) {
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
      return;
    }

    const tension = Math.max(Math.abs(dx) * 0.4, Math.min(Math.abs(dx) * 0.75, Math.abs(dy) * 0.25));
    const dir = Math.sign(dx) || 1;
    const cp1X = x1 + dir * tension;
    const cp2X = x2 - dir * tension;

    path.moveTo(x1, y1 - r1);
    path.bezierCurveTo(cp1X, y1 - r1, cp2X, y2 - r2, x2, y2 - r2);
    path.lineTo(x2, y2 + r2);
    path.bezierCurveTo(cp2X, y2 + r2, cp1X, y1 + r1, x1, y1 + r1);
    path.closePath();"""

if text.count(old_anim) != 1:
    raise SystemExit(f"expected 1 match for old_anim, got {text.count(old_anim)}")
if text.count(old_ribbon) != 1:
    raise SystemExit(f"expected 1 match for old_ribbon, got {text.count(old_ribbon)}")

text = text.replace(old_anim, new_anim)
text = text.replace(old_ribbon, new_ribbon)
path.write_text(text, encoding="utf-8")
PY

echo "FIX OK"
