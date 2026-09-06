#!/usr/bin/env bash
set -euo pipefail

test -f "./src/js/core/camera.js"
test -f "./src/js/interaction/node-actions.js"
test -f "./src/js/interaction/shortcuts.js"
test -f "./src/js/ui/events.js"

python3 - <<'PY'
from pathlib import Path
import re

# 1. 升级 camera.js: 支持操作意图策略分发 (click / create / keyboard / center)
cam_path = Path("./src/js/core/camera.js")
cam_text = cam_path.read_text(encoding="utf-8")

# 统一替换函数签名
cam_text = re.sub(
    r'export function locateFocusedNode\(nodeOrId = null, animated = true, customCtx = null,[^)]*\)',
    'export function locateFocusedNode(nodeOrId = null, animated = true, customCtx = null, intent = "click")',
    cam_text
)

# 替换 ensureNodeVisible 为强制居中策略
cam_text = re.sub(
    r'export function ensureNodeVisible\(nodeOrId = null, animated = true\) \{ locateFocusedNode\(nodeOrId, animated[^)]*\); \}',
    'export function ensureNodeVisible(nodeOrId = null, animated = true) { locateFocusedNode(nodeOrId, animated, null, "center"); }',
    cam_text
)

# 替换计算与位移策略核心块
calc_pattern = r'(const nodeScreenH = \(targetNode\.height \|\| 36\) \* currentScale;)([\s\S]*?)(  if \(animated && followMode === "smooth"\) \{)'
new_policy = r'''\1

  const isCenter = intent === true || intent === "center";
  const isCreate = intent === "create";
  const isKeyboard = intent === "keyboard";

  let deltaX = 0;
  let deltaY = 0;

  if (isCenter) {
    // 🌟 策略 4 [搜索/双链/聚焦]：平滑全局居中回正
    deltaX = usableCenterX - (nodeScreenX + nodeScreenW / 2);
    deltaY = usableCenterY - (nodeScreenY + nodeScreenH / 2);
  } else if (isCreate) {
    // 🌟 策略 2 [Tab/Enter 新建]：为后续连续输入预留前瞻留白 (Forward Cushion ~12%)
    const cushionX = Math.round(usableW * 0.12);
    const cushionY = Math.round(screenH * 0.10);
    const targetDir = targetNode.branchDirection;

    if (targetDir === "right") {
      const rightBoundary = usableW - 48;
      if (nodeScreenX + nodeScreenW + cushionX > rightBoundary) {
        deltaX = rightBoundary - (nodeScreenX + nodeScreenW + cushionX);
      }
    } else if (targetDir === "left") {
      const leftBoundary = 48;
      if (nodeScreenX - cushionX < leftBoundary) {
        deltaX = leftBoundary - (nodeScreenX - cushionX);
      }
    }

    if (nodeScreenY < 48) {
      deltaY = 48 - nodeScreenY;
    } else if (nodeScreenY + nodeScreenH + cushionY > screenH - 48) {
      deltaY = (screenH - 48) - (nodeScreenY + nodeScreenH + cushionY);
    }
  } else if (isKeyboard) {
    // 🌟 策略 3 [方向键遍历]：编辑器级边界吸附微推 (Edge Clamp)
    const marginX = Math.min(64, Math.max(36, usableW * 0.05));
    const marginY = Math.min(64, Math.max(36, screenH * 0.06));

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
  } else {
    // 🌟 策略 1 [鼠标点击]：宽死区极度克制，节点基本在视口内则绝对静止
    const visibleLeft = Math.max(0, nodeScreenX);
    const visibleRight = Math.min(usableW, nodeScreenX + nodeScreenW);
    const visibleTop = Math.max(0, nodeScreenY);
    const visibleBottom = Math.min(screenH, nodeScreenY + nodeScreenH);

    const visibleW = Math.max(0, visibleRight - visibleLeft);
    const visibleH = Math.max(0, visibleBottom - visibleTop);
    const ratioW = nodeScreenW > 0 ? (visibleW / nodeScreenW) : 1;
    const ratioH = nodeScreenH > 0 ? (visibleH / nodeScreenH) : 1;

    // 只要有 70% 露出且未被侧边栏严重遮挡，相机彻底静止，杜绝抢焦点与视觉摇晃
    if (ratioW >= 0.70 && ratioH >= 0.70) {
      return;
    }

    // 严重遮挡时仅轻柔推入完整露出 (36px 安全边距)
    const pad = 36;
    if (nodeScreenX < pad) {
      deltaX = pad - nodeScreenX;
    } else if (nodeScreenX + nodeScreenW > usableW - pad) {
      deltaX = (usableW - pad) - (nodeScreenX + nodeScreenW);
    }

    if (nodeScreenY < pad) {
      deltaY = pad - nodeScreenY;
    } else if (nodeScreenY + nodeScreenH > screenH - pad) {
      deltaY = (screenH - pad) - (nodeScreenY + nodeScreenH);
    }
  }

  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

  const targetX = camera.transform.x + deltaX;
  const targetY = camera.transform.y + deltaY;

\3'''

if not re.search(calc_pattern, cam_text):
    raise SystemExit("failed to match calc_pattern in camera.js")

cam_text = re.sub(calc_pattern, new_policy, cam_text)
cam_path.write_text(cam_text, encoding="utf-8")

# 2. 升级 node-actions.js: 新建节点标记为 "create" 前瞻留白，删除回退标记为 "keyboard"
act_path = Path("./src/js/interaction/node-actions.js")
act_text = act_path.read_text(encoding="utf-8")
act_text = act_text.replace(
    'locateFocusedNode(child.id, true, ctx);',
    'locateFocusedNode(child.id, true, ctx, "create");'
)
act_text = act_text.replace(
    'locateFocusedNode(sib.id, true, ctx);',
    'locateFocusedNode(sib.id, true, ctx, "create");'
)
act_text = act_text.replace(
    'locateFocusedNode(fallbackId, true);',
    'locateFocusedNode(fallbackId, true, ctx, "keyboard");'
)
act_path.write_text(act_text, encoding="utf-8")

# 3. 升级 shortcuts.js: 方向键遍历标记为 "keyboard" 边界吸附
sc_path = Path("./src/js/interaction/shortcuts.js")
sc_text = sc_path.read_text(encoding="utf-8")
sc_text = sc_text.replace(
    'locateFocusedNode(root.id, true, ctx);',
    'locateFocusedNode(root.id, true, ctx, "keyboard");'
)
sc_text = sc_text.replace(
    'locateFocusedNode(target.id, true, ctx);',
    'locateFocusedNode(target.id, true, ctx, "keyboard");'
)
sc_path.write_text(sc_text, encoding="utf-8")

# 4. 升级 events.js: 画布单击明确分发 "click" 意图
ev_path = Path("./src/js/ui/events.js")
ev_text = ev_path.read_text(encoding="utf-8")
ev_text = re.sub(
    r'locateFocusedNode\(data\.node\.id,\s*true,\s*docCtx\);',
    'locateFocusedNode(data.node.id, true, docCtx, "click");',
    ev_text
)
ev_path.write_text(ev_text, encoding="utf-8")

print("INTENT ROAMING PATCH APPLIED OK")
PY

echo "FIX OK"
