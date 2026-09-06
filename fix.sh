#!/usr/bin/env bash
set -euo pipefail

FILE="./src/js/core/camera.js"
test -f "$FILE"

python3 - "$FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

old = """  // 黄金舒适视野边界（根据生长朝向非对称预警）
  const safeMarginLeft = targetNode.branchDirection === "left" ? Math.max(160, usableW * 0.28) : Math.max(120, usableW * 0.15);
  const safeMarginRight = targetNode.branchDirection === "right" ? Math.max(160, usableW * 0.28) : Math.max(120, usableW * 0.15);
  const safeMarginY = Math.max(90, screenH * 0.18);

  const isInsideComfortZone =
    nodeScreenX >= safeMarginLeft &&
    nodeScreenX + nodeScreenW <= (usableW - safeMarginRight) &&
    nodeScreenY >= safeMarginY &&
    nodeScreenY + nodeScreenH <= (screenH - safeMarginY);

  if (!forceCenter && isInsideComfortZone) return;

  const nodeCenterX = targetNode.x + (targetNode.width || 80) / 2;
  const nodeCenterY = targetNode.y + (targetNode.height || 36) / 2;

  // 🌟 前进方向智能留白（Forward Headroom）：连续输入时自动向延伸前方预留 18% 开阔视野
  let headroomOffsetX = 0;
  let headroomOffsetY = 0;
  if (targetNode.branchDirection === "right") {
    headroomOffsetX = -usableW * 0.18;
  } else if (targetNode.branchDirection === "left") {
    headroomOffsetX = usableW * 0.18;
  } else if (targetNode.branchDirection === "down") {
    headroomOffsetY = -screenH * 0.14;
  }

  const targetX = (usableCenterX + headroomOffsetX) - nodeCenterX * currentScale;
  const targetY = (usableCenterY + headroomOffsetY) - nodeCenterY * currentScale;"""

new = """  const marginX = Math.min(64, Math.max(24, usableW * 0.06));
  const marginY = Math.min(64, Math.max(24, screenH * 0.08));

  let deltaX = 0;
  let deltaY = 0;

  if (forceCenter) {
    deltaX = usableCenterX - (nodeScreenX + nodeScreenW / 2);
    deltaY = usableCenterY - (nodeScreenY + nodeScreenH / 2);
  } else {
    // 最小必要推移 (Minimal Delta Panning)：节点在可见视口内纹丝不动，仅当触碰边缘时微幅平移
    if (nodeScreenX < marginX) {
      deltaX = marginX - nodeScreenX;
    } else if (nodeScreenX + nodeScreenW > usableW - marginX) {
      deltaX = (usableW - marginX) - (nodeScreenX + nodeScreenW);
    }

    if (nodeScreenY < marginY) {
      deltaY = marginY - nodeScreenY;
    } else if (nodeScreenY + nodeScreenH > screenH - marginY) {
      deltaY = (screenH - marginY) - (nodeScreenY + nodeScreenH);
    }

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
  }

  const targetX = camera.transform.x + deltaX;
  const targetY = camera.transform.y + deltaY;"""

if text.count(old) != 1:
    raise SystemExit(f"expected exactly 1 match, got {text.count(old)}")

path.write_text(text.replace(old, new), encoding="utf-8")
PY

echo "FIX OK"
