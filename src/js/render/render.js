import { addChildNode, addSiblingNode } from "../interaction/node-actions.js";
let gDropIndicator = null;
export function setDropIndicator(ind) {
  gDropIndicator = ind;
  renderInteractiveLayer();
}

export function renderInteractiveLayer() {
  const ic = typeof document !== "undefined" ? document.getElementById("canvas-interactive") : null;
  if (!ic) return;
  const ictx = ic.getContext("2d");
  if (!ictx) return;

  const dpr = window.devicePixelRatio || 1;
  ictx.clearRect(0, 0, ic.width, ic.height);
  if (!gDropIndicator) return;

  const s = camera.transform.scale;
  ictx.save();
  ictx.setTransform(s * dpr, 0, 0, s * dpr, camera.transform.x * dpr, camera.transform.y * dpr);

  if (gDropIndicator.type === "reparent") {
    ictx.strokeStyle = "#0071e3";
    ictx.lineWidth = 2.5 / s;
    drawAppleSquircle(ictx, gDropIndicator.x - 3, gDropIndicator.y - 3, gDropIndicator.width + 6, gDropIndicator.height + 6, 12);
    ictx.fillStyle = "rgba(0, 113, 227, 0.14)";
    ictx.fill();
    ictx.stroke();
  } else {
    ictx.strokeStyle = "#0071e3";
    ictx.lineWidth = Math.max(2.5, 3.2 / s);
    ictx.lineCap = "round";
    ictx.shadowColor = "rgba(0, 113, 227, 0.5)";
    ictx.shadowBlur = 8;
    ictx.beginPath();
    ictx.moveTo(gDropIndicator.x1, gDropIndicator.y1);
    ictx.lineTo(gDropIndicator.x2, gDropIndicator.y2);
    ictx.stroke();

    ictx.fillStyle = "#0071e3";
    ictx.beginPath();
    ictx.arc(gDropIndicator.x1, gDropIndicator.y1, 4.5 / s, 0, Math.PI * 2);
    ictx.arc(gDropIndicator.x2, gDropIndicator.y2, 4.5 / s, 0, Math.PI * 2);
    ictx.fill();
  }
  ictx.restore();
}

import { computeLayout, assignCoordinates, getActiveFontFamily, MAX_NODE_TEXT_WIDTH, MAX_ROOT_TEXT_WIDTH, getTextLineWidth, wrapTextLines } from "../geometry/layout.js";
import { state, findNode, getActiveTab, getAncestors, findParent, getActiveDocumentContext } from "../core/state.js";
import { saveSnapshot, executeCommand, COMMANDS } from "../core/history.js";
import { camera, locateFocusedNode, smartAdaptiveCenter, stopAllCameraAnimations } from "../core/camera.js";
import { updateMinimap, syncMinimapViewportBox } from "./minimap.js";
import { drawAppleSquircle } from "../geometry/squircle.js";
import { drawNodeContent } from "./node-drawer.js";
import { bus, EVENTS } from "../core/event-bus.js";

const canvas = document.getElementById("canvas-main");
const inlineEditor = document.getElementById("inline-editor");
const viewport = document.getElementById("viewport");

let cachedVpWidth = 0, cachedVpHeight = 0, cachedDpr = 0;

export function resizeCanvas(force = false) {
  if (!canvas || !viewport) return;
  const dpr = window.devicePixelRatio || 1;
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;

  // 🌟 防黑屏核心：容器处于隐藏态（宽/高为0）时绝对禁止设置画布尺寸或污染缓存
  if (w <= 0 || h <= 0) return;

  if (force || w !== cachedVpWidth || h !== cachedVpHeight || dpr !== cachedDpr) {
    cachedVpWidth = w;
    cachedVpHeight = h;
    cachedDpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    const ic = typeof document !== "undefined" ? document.getElementById("canvas-interactive") : null;
    if (ic) {
      ic.width = Math.round(w * dpr);
      ic.height = Math.round(h * dpr);
      ic.style.width = w + "px";
      ic.style.height = h + "px";
    }
  }
}

// 🌟 统一的物理像素绝对定位基准计算：首行顶对齐锁定 + 左边界锚定，彻底消除多行蹦床与居中跳动
function getNodeEditorMetrics(node, s, customCtx = null, currentText = null) {
  const ctx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  const isRoot = ctx ? (node.id === ctx.focusedRootId) : false;
  const baseSize = node.fontSize ? parseFloat(node.fontSize) : (isRoot ? 18 : 14);
  const fontSizePx = Math.round(baseSize * s);
  const lineHeightPx = Math.round((node.lineHeight || Math.round(baseSize * 1.35)) * s);

  const textToMeasure = currentText !== null ? currentText : (node.text || "");
  const maxAllowedWorldW = isRoot ? MAX_ROOT_TEXT_WIDTH : MAX_NODE_TEXT_WIDTH;
  const maxAllowedScreenW = Math.round(maxAllowedWorldW * s + 24);

  const curLines = textToMeasure.split(/\r?\n/);
  let maxLW = 0;
  for (let i = 0; i < curLines.length; i++) {
    const lw = getTextLineWidth(curLines[i], baseSize);
    if (lw > maxLW) maxLW = lw;
  }
  const textPx = Math.ceil(maxLW * s);
  const minEditorW = Math.max(Math.round(48 * s), 48);
  const editorWidth = Math.min(maxAllowedScreenW, Math.max(minEditorW, textPx + 16));

  const padX = Math.max(4, Math.round((node.width - (node.contentWidth || 0)) / 2));
  const currentOffset = padX + (node.extraLeftWidth || 0);
  const textStartX = node.x + currentOffset;
  const textScreenX = Math.round(textStartX * s + camera.transform.x - 4);

  const origLines = node.lines || String(node.text ?? "").split(/\r?\n/);
  const origTotalH = (origLines.length - 1) * (node.lineHeight || Math.round(baseSize * 1.35));
  const centerY = node.y + node.height / 2;
  const firstLineCenterY = centerY - origTotalH / 2;
  const textScreenY = Math.round((firstLineCenterY - (node.lineHeight || Math.round(baseSize * 1.35)) / 2) * s + camera.transform.y - 2);

  const minEditorHeight = lineHeightPx + 4;
  return { fontSizePx, lineHeightPx, textScreenX, textScreenY, editorWidth, minEditorHeight, maxAllowedScreenW };
}

export function syncInlineEditorPosition() {
  if (!state.editingNodeId || !inlineEditor || inlineEditor.classList.contains("hidden")) return;
  const ctx = getActiveDocumentContext();
  const node = ctx ? findNode(state.editingNodeId, ctx.mindData) : null;
  if (!node || node.x === undefined) return;

  const s = camera.transform.scale;
  const m = getNodeEditorMetrics(node, s, ctx, inlineEditor.value);

  inlineEditor.style.transform = "none";
  inlineEditor.style.left = `${m.textScreenX}px`;
  inlineEditor.style.top = `${m.textScreenY}px`;
  inlineEditor.style.width = `${m.editorWidth}px`;
  inlineEditor.style.minHeight = `${m.minEditorHeight}px`;
  inlineEditor.style.maxWidth = `${m.maxAllowedScreenW}px`;
  inlineEditor.style.fontSize = `${m.fontSizePx}px`;
  inlineEditor.style.lineHeight = `${m.lineHeightPx}px`;

  inlineEditor.style.height = "auto";
  const actualH = Math.max(m.minEditorHeight, inlineEditor.scrollHeight);
  inlineEditor.style.height = `${actualH}px`;
}

function appendTaperedRibbon(path, node, child, isPrimary, boxStyle, s) {
  const isDown = child.branchDirection === "down";
  const isLeft = child.branchDirection === "left";
  const isParentUnderline = boxStyle === "underline";
  const isChildUnderline = boxStyle === "underline";

  // 🌟 解决问题 2：智能避让折叠按钮，避免从圆圈中心生硬穿模
  const hasBadge = !isPrimary && node.children && node.children.length > 0;
  const badgeClearance = hasBadge ? 7.2 : 0;

  let x1, y1, x2, y2;
  if (isDown) {
    x1 = node.x + node.width / 2;
    y1 = node.y + node.height + badgeClearance;
    x2 = child.x + child.width / 2;
    y2 = child.y;
  } else if (isLeft) {
    x1 = node.x - badgeClearance;
    x2 = child.x + child.width;
    y2 = isChildUnderline ? (child.y + child.height) : (child.y + child.height / 2);
    y1 = isParentUnderline ? (node.y + node.height) : (node.y + node.height / 2);
  } else {
    x1 = node.x + node.width + badgeClearance;
    x2 = child.x;
    y2 = isChildUnderline ? (child.y + child.height) : (child.y + child.height / 2);
    y1 = isParentUnderline ? (node.y + node.height) : (node.y + node.height / 2);
  }

  // 🌟 解决问题 1：提升饱满线宽基准，彻底告别单薄发虚的蛛丝感
  const w1 = isPrimary ? (4.6 / s) : (2.4 / s);
  const w2 = isPrimary ? (2.6 / s) : (1.8 / s);
  const r1 = w1 / 2;
  const r2 = w2 / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (isDown) {
    // 动态张力控制：纵向跨度大时横向平滑舒展
    const tension = Math.min(Math.abs(dy) * 0.45, Math.abs(dx) * 0.65);
    const cp1Y = y1 + Math.max(16, tension);
    const cp2Y = y2 - Math.max(16, tension);
    path.moveTo(x1 - r1, y1);
    path.bezierCurveTo(x1 - r1, cp1Y, x2 - r2, cp2Y, x2 - r2, y2);
    path.lineTo(x2 + r2, y2);
    path.bezierCurveTo(x2 + r2, cp2Y, x1 + r1, cp1Y, x1 + r1, y1);
    path.closePath();
  } else {
    // 🌟 解决问题 3：自适应张力补偿，消除大落差下的 90 度急折角
    // 🌟 防翻转自交卫语句：若间距异常或几何反向，退化为安全连线，绝不产生全屏畸变扇面
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
    path.closePath();
  }
}

function appendConnectionPath(path, node, child, lineStyle, isPrimary = false, boxStyle = "squircle", isUltraLOD = false) {
  const isDown = child.branchDirection === "down";
  const isLeft = child.branchDirection === "left";
  const isParentUnderline = boxStyle === "underline";
  const isChildUnderline = boxStyle === "underline";

  let x1, y1, x2, y2;
  if (isDown) {
    x1 = node.x + node.width / 2;
    y1 = node.y + node.height;
    x2 = child.x + child.width / 2;
    y2 = child.y;
  } else if (isLeft) {
    x1 = node.x;
    x2 = child.x + child.width;
    y2 = isChildUnderline ? (child.y + child.height) : (child.y + child.height / 2);
    y1 = isParentUnderline ? (node.y + node.height) : (node.y + node.height / 2);
  } else {
    x1 = node.x + node.width;
    x2 = child.x;
    y2 = isChildUnderline ? (child.y + child.height) : (child.y + child.height / 2);
    y1 = isParentUnderline ? (node.y + node.height) : (node.y + node.height / 2);
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  path.moveTo(x1, y1);

  if (isUltraLOD || lineStyle === "straight") {
    path.lineTo(x2, y2);
  } else if (lineStyle === "rounded-ortho") {
    const dirX = Math.sign(dx) || 1;
    const dirY = Math.sign(dy) || 1;
    if (isDown) {
      const midY = y1 + dy * 0.5;
      const r = Math.min(10, Math.abs(dx) / 2, Math.abs(dy) / 2);
      if (r < 1 || dx === 0) {
        path.lineTo(x1, midY); path.lineTo(x2, midY); path.lineTo(x2, y2);
      } else {
        path.lineTo(x1, midY - dirY * r);
        path.arcTo(x1, midY, x1 + dirX * r, midY, r);
        path.lineTo(x2 - dirX * r, midY);
        path.arcTo(x2, midY, x2, midY + dirY * r, r);
        path.lineTo(x2, y2);
      }
    } else {
      const midX = x1 + dx * 0.5;
      const r = Math.min(10, Math.abs(dx) / 2, Math.abs(dy) / 2);
      if (r < 1 || dy === 0) {
        path.lineTo(midX, y1); path.lineTo(midX, y2); path.lineTo(x2, y2);
      } else {
        path.lineTo(midX - dirX * r, y1);
        path.arcTo(midX, y1, midX, y1 + dirY * r, r);
        path.lineTo(midX, y2 - dirY * r);
        path.arcTo(midX, y2, midX + dirX * r, y2, r);
        path.lineTo(x2, y2);
      }
    }
  } else if (lineStyle === "sharp-ortho") {
    const mid = isDown ? (y1 + dy * 0.5) : (x1 + dx * 0.5);
    if (isDown) { path.lineTo(x1, mid); path.lineTo(x2, mid); path.lineTo(x2, y2); }
    else { path.lineTo(mid, y1); path.lineTo(mid, y2); path.lineTo(x2, y2); }
  } else if (lineStyle === "arc-corner") {
    if (isDown) {
      path.bezierCurveTo(x1, y1 + dy * 0.7, x2, y1 + dy * 0.3, x2, y2);
    } else {
      path.bezierCurveTo(x1 + dx * 0.7, y1, x2 - dx * 0.3, y2, x2, y2);
    }
  } else {
    if (isDown) {
      path.bezierCurveTo(x1, y1 + dy * 0.5, x2, y2 - dy * 0.5, x2, y2);
    } else {
      path.bezierCurveTo(x1 + dx * 0.5, y1, x2 - dx * 0.5, y2, x2, y2);
    }
  }
}

function isRectVisible(x, y, w, h, vp) {
  return !(x + w < vp.left || x > vp.right || y + h < vp.top || y > vp.bottom);
}

function collectRenderPasses(node, level, docCtx, vpBounds, isRootOfView, primaryBatches, secondaryBatches, taperedBatches, visibleNodes, isUltraLOD, s) {
  if (!node) return;
  if (!isRootOfView && node.treeMinX !== undefined) {
    const tw = (node.treeMaxX || (node.x + node.width)) - node.treeMinX;
    const th = (node.treeMaxY || (node.y + node.height)) - node.treeMinY;
    if (!isRectVisible(node.treeMinX, node.treeMinY, tw, th, vpBounds)) return;
  }

  const lineStyle = docCtx?.lineStyle || "curve";
  const boxStyle = docCtx?.boxStyle || "squircle";

  if (node.children && !node.collapsed) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const color = child.colorTheme ? child.colorTheme.line : "#86868b";
      if (lineStyle === "curve" && !isUltraLOD) {
        let tPath = taperedBatches.get(color);
        if (!tPath) { tPath = new Path2D(); taperedBatches.set(color, tPath); }
        appendTaperedRibbon(tPath, node, child, isRootOfView, boxStyle, s);
      } else {
        const targetBatches = isRootOfView ? primaryBatches : secondaryBatches;
        let path = targetBatches.get(color);
        if (!path) { path = new Path2D(); targetBatches.set(color, path); }
        appendConnectionPath(path, node, child, lineStyle, isRootOfView, boxStyle, isUltraLOD);
      }
      collectRenderPasses(child, level + 1, docCtx, vpBounds, false, primaryBatches, secondaryBatches, taperedBatches, visibleNodes, isUltraLOD, s);
    }
  }

  if (isRootOfView || isRectVisible(node.x, node.y, node.width, node.height, vpBounds)) {
    visibleNodes.push({ node, level, isRootOfView });
  }
}

export function ensureLayoutReady(tab = getActiveTab(), force = false) {
  if (!tab || !tab.mindData) return false;
  const currentRoot = findNode(tab.focusedRootId, tab.mindData) || tab.mindData;
  if (!currentRoot) return false;

  const isDirty = force || tab.isLayoutDirty !== false || currentRoot.treeMinX === undefined || currentRoot._layoutDirty;
  if (isDirty) {
    computeLayout(currentRoot, 0, tab.focusedRootId, tab.layoutStructure, tab.nodeSpacing || "normal", force);
    assignCoordinates(currentRoot, 0, 0, tab.focusedRootId, tab.layoutStructure, null, null, tab.colorPalette || "apple-classic", tab.nodeSpacing || "normal", tab.spatialIndex, true);
    tab.isLayoutDirty = false;
    state.isLayoutDirty = false;
    return true;
  }
  return false;
}

export function render(docCtxOrState, callbacks) {
  if (!canvas) return;
  resizeCanvas(false);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const docCtx = (docCtxOrState && docCtxOrState.tab) ? docCtxOrState : (getActiveTab()?._context || null);
  if (!docCtx) return;
  const curTab = docCtx.tab;
  const currentRoot = findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData;
  const hadLayoutRecalc = ensureLayoutReady(curTab, docCtx.isLayoutDirty);

  const dpr = window.devicePixelRatio || 1;
  const vpW = cachedVpWidth || window.innerWidth;
  const vpH = cachedVpHeight || window.innerHeight;
  const s = camera.transform.scale;
  const isUltraLOD = s < 0.25;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 🌟 160ms Apple 动力学 FLIP 坐标差值过渡 (舒展展开、平滑让位与间隙闭合)
  let hasActiveAnim = false;
  const animNow = performance.now();
  const restoreList = [];

  function updateNodeAnimation(n, parent = null) {
    if (!n) return;
    if (state.isInteracting) {
      n._rx = n.x;
      n._ry = n.y;
      n._animStart = undefined;
    } else {
      if (n._rx === undefined) {
        // 🌟 首次打开/渲染直接就位，严禁从中心点反向撕裂拉扯
        n._rx = n.x;
        n._ry = n.y;
        n._startX = n.x;
        n._startY = n.y;
        n._animStart = undefined;
      } else if (n._targetX !== n.x || n._targetY !== n.y) {
        n._startX = n._rx;
        n._startY = n._ry;
        n._animStart = animNow;
        n._targetX = n.x;
        n._targetY = n.y;
      }

      if (n._animStart !== undefined) {
        const elapsed = animNow - n._animStart;
        const duration = 200; // 🌟 200ms 黄金阻尼，赋予枝干生长如植物舒展般的生命活力
        if (elapsed < duration) {
          hasActiveAnim = true;
          const progress = elapsed / duration;
          const ease = 1 - Math.pow(1 - progress, 3.2);
          n._rx = n._startX + (n.x - n._startX) * ease;
          n._ry = n._startY + (n.y - n._startY) * ease;
        } else {
          n._rx = n.x;
          n._ry = n.y;
          n._animStart = undefined;
        }
      }
    }

    if (n._rx !== undefined && (n._rx !== n.x || n._ry !== n.y)) {
      restoreList.push({ node: n, x: n.x, y: n.y });
      n.x = n._rx;
      n.y = n._ry;
    }

    if (n.children && !n.collapsed) {
      for (let i = 0; i < n.children.length; i++) {
        updateNodeAnimation(n.children[i], n);
      }
    }
  }
  updateNodeAnimation(currentRoot);

  const vpBounds = {
    left: (-camera.transform.x) / s - 160,
    top: (-camera.transform.y) / s - 160,
    right: (-camera.transform.x + vpW) / s + 160,
    bottom: (-camera.transform.y + vpH) / s + 160
  };

  const primaryBatches = new Map();
  const secondaryBatches = new Map();
  const taperedBatches = new Map();
  const visibleNodes = [];
  collectRenderPasses(currentRoot, 0, docCtx, vpBounds, true, primaryBatches, secondaryBatches, taperedBatches, visibleNodes, isUltraLOD, s);

  ctx.save();
  try {
    ctx.setTransform(s * dpr, 0, 0, s * dpr, camera.transform.x * dpr, camera.transform.y * dpr);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const primaryStrokeWidth = 3.0 / s;
  const secondaryStrokeWidth = 2.2 / s;
  const nodeBorderWidth = 2.0 / s;

  // 1. 常规几何连线渲染 (直线/折线/极速 LOD)
  ctx.lineWidth = secondaryStrokeWidth;
  secondaryBatches.forEach((path, color) => { ctx.strokeStyle = color; ctx.stroke(path); });

  ctx.lineWidth = primaryStrokeWidth;
  primaryBatches.forEach((path, color) => { ctx.strokeStyle = color; ctx.stroke(path); });

  // 2. 🌟 Apple 仿生流态递减带（填充 + 边缘高纯度锁色，消除亚像素虚化）
  ctx.lineWidth = 0.6 / s;
  taperedBatches.forEach((path, color) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.fill(path);
    ctx.stroke(path);
  });

  const boxStyle = docCtx.boxStyle || "squircle";
  const isGlobalDark = document.documentElement.getAttribute("data-theme") === "dark";
  const isDarkCanvas = isGlobalDark || ["space-gray", "midnight-abyss", "prussian-navy", "slate-chalkboard", "cyber-violet", "obsidian-coffee"].includes(docCtx.canvasBgColor);
  const enableShadows = !state.isInteracting && visibleNodes.length < 1500 && s >= 0.35;

  for (let i = 0; i < visibleNodes.length; i++) {
    const { node, level, isRootOfView } = visibleNodes[i];
    const isSelected = docCtx.selectedIds.has(node.id);
    const r = isRootOfView ? 11 : (level === 1 ? 8 : 6.5);

    if (isUltraLOD && !isRootOfView) {
      ctx.fillStyle = node.colorTheme ? (node.colorTheme.solid || node.colorTheme.border) : "#94a3b8";
      ctx.fillRect(node.x, node.y, node.width, node.height);
      continue;
    }

    // 🌟 卡片外壳由 Canvas 保持 100% 完整与稳固，确保图标与分支边框绝对统一
    if (boxStyle !== "underline") {
      ctx.save();
      if (boxStyle === "rect" || s < 0.35) {
        ctx.beginPath();
        ctx.rect(node.x, node.y, node.width, node.height);
      } else {
        drawAppleSquircle(ctx, node.x, node.y, node.width, node.height, r);
      }

      if (isRootOfView) {
        if (enableShadows) {
          ctx.shadowColor = "rgba(0, 113, 227, 0.25)";
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 2;
        }

        const grad = ctx.createLinearGradient(node.x, node.y, node.x, node.y + node.height);
        grad.addColorStop(0, "#0077ed");
        grad.addColorStop(1, "#005bb5");
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.50)";
        ctx.lineWidth = 2.4 / s;
        ctx.stroke();
      } else if (boxStyle === "solid") {
        if (enableShadows) {
          ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 1.5;
        }

        ctx.fillStyle = node.colorTheme ? (node.colorTheme.solid || node.colorTheme.border) : "#0071e3";
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.40)";
        ctx.lineWidth = nodeBorderWidth;
        ctx.stroke();
      } else {
        if (!isDarkCanvas && enableShadows) {
          ctx.shadowColor = "rgba(15, 23, 42, 0.04)";
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 1;
        }

        ctx.fillStyle = isDarkCanvas ? "rgba(30, 36, 48, 0.96)" : "#ffffff";
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.strokeStyle = node.colorTheme ? node.colorTheme.border : (isDarkCanvas ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.18)");
        ctx.lineWidth = nodeBorderWidth;
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.moveTo(node.x, node.y + node.height);
      ctx.lineTo(node.x + node.width, node.y + node.height);
      // 🌟 选中时下划线自身同步点亮为 Apple Blue，消灭异色重叠打架
      const defaultColor = node.colorTheme ? node.colorTheme.line : (isDarkCanvas ? "#94a3b8" : "#86868b");
      ctx.strokeStyle = isSelected ? (isDarkCanvas ? "#38bdf8" : "#0071e3") : defaultColor;
      const defaultUnderlineWidth = isRootOfView ? (2.8 / s) : (2.2 / s);
      ctx.lineWidth = isSelected ? (3.4 / s) : defaultUnderlineWidth;
      ctx.stroke();
    }

    if (isSelected) {
      ctx.save();
      const offset = 2.5;
      if (boxStyle === "underline") {
        // 🌟 醒目高定焦点框：饱满选区微光垫底 + 1.6px 精致 Apple 焦点外框 + 8px 弥散光晕
        const padX = 4;
        const padY = 3;
        ctx.beginPath();
        drawAppleSquircle(ctx, node.x - padX, node.y - padY, node.width + padX * 2, node.height + padY * 2, 6);
        ctx.fillStyle = isDarkCanvas ? "rgba(56, 189, 248, 0.20)" : "rgba(0, 113, 227, 0.13)";
        ctx.fill();

        if (enableShadows) {
          ctx.shadowColor = isDarkCanvas ? "rgba(56, 189, 248, 0.5)" : "rgba(0, 113, 227, 0.38)";
          ctx.shadowBlur = 8;
        }

        ctx.strokeStyle = isDarkCanvas ? "rgba(56, 189, 248, 0.85)" : "rgba(0, 113, 227, 0.72)";
        ctx.lineWidth = 1.6 / s;
        ctx.stroke();
      } else if (boxStyle === "rect" || s < 0.35) {
        ctx.beginPath();
        ctx.rect(node.x - offset, node.y - offset, node.width + offset * 2, node.height + offset * 2);
        if (enableShadows) {
          ctx.shadowColor = "rgba(0, 113, 227, 0.35)";
          ctx.shadowBlur = 6;
        }
        ctx.strokeStyle = "#0071e3";
        ctx.lineWidth = 2.6 / s;
        ctx.stroke();
      } else {
        ctx.beginPath();
        drawAppleSquircle(ctx, node.x - offset, node.y - offset, node.width + offset * 2, node.height + offset * 2, r + 2);
        if (enableShadows) {
          ctx.shadowColor = "rgba(0, 113, 227, 0.35)";
          ctx.shadowBlur = 6;
        }
        ctx.strokeStyle = "#0071e3";
        ctx.lineWidth = 2.6 / s;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  for (let i = 0; i < visibleNodes.length; i++) {
    const { node, level, isRootOfView } = visibleNodes[i];
    drawNodeContent(ctx, node, level, isRootOfView, docCtx, s);
  }

  // 交互反馈由独立分层 canvas-interactive 承载，主拓扑层免受重绘干扰
  } finally {
    ctx.restore();
    for (let i = 0; i < restoreList.length; i++) {
      const item = restoreList[i];
      item.node.x = item.x;
      item.node.y = item.y;
    }
  }

  if (hasActiveAnim && !state.isInteracting) {
    requestAnimationFrame(() => bus.emit(EVENTS.RENDER_CANVAS_ONLY));
  }

  updateBreadcrumbs(docCtx, (id) => {
    docCtx.focusBranch(id);
    callbacks.onRender();
    smartAdaptiveCenter(null, true, docCtx);
  });

  // 🌟 节点增删、编辑及变动时实时同步刷新小地图
  updateMinimap();

  renderInteractiveLayer();
  syncInlineEditorPosition();
}

let gCachedBreadcrumbSig = null;

export function updateBreadcrumbs(docCtx, onSelectRoot) {
  const bar = document.getElementById("breadcrumb-bar");
  const linksContainer = document.getElementById("breadcrumb-links");
  const homeIcon = document.getElementById("breadcrumb-home-icon");
  const exitBtn = document.getElementById("btn-exit-focus");

  const ctx = (docCtx && docCtx.tab) ? docCtx : (getActiveTab()?._context || null);
  const rootId = ctx?.mindData?.id || "root";
  const isFocused = Boolean(ctx?.focusedRootId && ctx.focusedRootId !== rootId);

  if (!bar || !linksContainer || !ctx) return;
  
  if (!isFocused) {
    if (!bar.classList.contains("hidden")) bar.classList.add("hidden");
    gCachedBreadcrumbSig = null;
    return;
  }

  const curSig = `${ctx.focusedRootId}_${rootId}`;
  if (gCachedBreadcrumbSig === curSig && !bar.classList.contains("hidden")) return;
  gCachedBreadcrumbSig = curSig;

  const ancestors = getAncestors(ctx.focusedRootId, ctx.mindData) || [];
  
  linksContainer.innerHTML = ancestors.map((node, i) => {
    const isLast = i === ancestors.length - 1;
    const rawTitle = (node.icon ? node.icon + " " : "") + (node.text || "分支");
    const safeTitle = String(rawTitle).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    return `
      <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-id="${node.id}" title="${safeTitle}">${safeTitle}</span>
      ${!isLast ? '<span class="breadcrumb-sep">›</span>' : ''}
    `;
  }).join("");

  linksContainer.querySelectorAll(".breadcrumb-item:not(.active)").forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      onSelectRoot(item.dataset.id);
    };
  });

  if (homeIcon) {
    homeIcon.onclick = (e) => {
      e.stopPropagation();
      onSelectRoot(rootId);
    };
  }

  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.stopPropagation();
      onSelectRoot(rootId);
    };
  }

  bar.classList.remove("hidden");
}

export function startEditNode(node, stateRef, onRender, isNewNode = false, customCtx = null) {
  if (!node || !viewport || !inlineEditor) return;
  stopAllCameraAnimations();
  state.editingNodeId = node.id;
  try {
    bus.emit(EVENTS.RENDER_APP);
  } catch (err) {
    console.warn("[YMind] Soft render emit bypass:", err);
  }

  const ctx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  if ((node.x === undefined || node.y === undefined) && ctx) {
    ensureLayoutReady(ctx.tab, true);
  }
  const originalText = String(node.text ?? "");
  const s = camera.transform.scale;
  const isRoot = ctx ? (node.id === ctx.focusedRootId) : false;
  const m = getNodeEditorMetrics(node, s, ctx);

  inlineEditor.style.position = "absolute";
  inlineEditor.style.transform = "none";
  inlineEditor.style.left = `${m.textScreenX}px`;
  inlineEditor.style.top = `${m.textScreenY}px`;
  inlineEditor.style.width = `${m.editorWidth}px`;
  inlineEditor.style.minHeight = `${m.minEditorHeight}px`;
  inlineEditor.style.maxWidth = `${m.maxAllowedScreenW}px`;
  inlineEditor.style.fontSize = `${m.fontSizePx}px`;
  inlineEditor.style.lineHeight = `${m.lineHeightPx}px`;
  inlineEditor.style.fontFamily = getActiveFontFamily();
  inlineEditor.style.fontWeight = String(node.fontWeight || (isRoot ? "700" : "500"));
  inlineEditor.style.fontStyle = node.fontStyle || "normal";
  inlineEditor.style.textDecoration = node.textDecoration || "none";
  inlineEditor.style.color = node.textColor && node.textColor !== "default" ? node.textColor : "var(--text-primary)";
  inlineEditor.removeAttribute("maxlength");
  inlineEditor.value = node.text || "";
  inlineEditor.classList.remove("hidden");
  void inlineEditor.offsetWidth;

  inlineEditor.focus();
  inlineEditor.select();
  requestAnimationFrame(() => {
    if (state.editingNodeId === node.id) {
      inlineEditor.focus();
      inlineEditor.select();
    }
  });

  const updateEditorGeometry = () => {
    const curM = getNodeEditorMetrics(node, s, ctx, inlineEditor.value);
    inlineEditor.style.transform = "none";
    inlineEditor.style.left = `${curM.textScreenX}px`;
    inlineEditor.style.top = `${curM.textScreenY}px`;
    inlineEditor.style.width = `${curM.editorWidth}px`;
    inlineEditor.style.height = "auto";
    const actualH = Math.max(curM.minEditorHeight, inlineEditor.scrollHeight);
    inlineEditor.style.height = `${actualH}px`;
  };

  let isIMEComposing = false;
  inlineEditor.oncompositionstart = () => { isIMEComposing = true; };
  inlineEditor.oncompositionupdate = () => { updateEditorGeometry(); };
  inlineEditor.oncompositionend = () => {
    isIMEComposing = false;
    updateEditorGeometry();
  };

  updateEditorGeometry();
  inlineEditor.oninput = updateEditorGeometry;

  let finished = false;
  const finish = (nextAction = "none", isCancelled = false) => {
    if (finished) return;
    finished = true;
    inlineEditor.oninput = null;
    inlineEditor.oncompositionstart = null;
    inlineEditor.oncompositionend = null;
    inlineEditor.classList.add("hidden");
    inlineEditor.style.transform = "none";
    
    // 🌟 致命崩溃 Bug 修复：将 const 改为可重新赋值的 let，防止溢出截取时 TypeError
    let val = inlineEditor.value.trim();
    state.editingNodeId = null;

    if (isCancelled || (val === "" && isNewNode)) {
      if (isNewNode && ctx) {
        const tab = ctx.tab;
        const lastRec = tab?.historyStack?.[tab.historyIndex];
        const parent = findParent(node.id, ctx.mindData);
        if (lastRec?.type === "COMMAND" && lastRec.payload?.type === COMMANDS.INSERT_NODE && lastRec.payload.node?.id === node.id) {
          ctx.undo();
          tab.historyStack.splice(tab.historyIndex + 1);
        } else if (parent) {
          parent.children = parent.children.filter(c => c.id !== node.id);
        }
        if (parent) {
          ctx.selectNode(parent.id);
          ctx.markLayoutDirty(parent.id);
        }
      }
      onRender();
      return;
    }

    if (val !== "" && val !== originalText && ctx) {
      ctx.executeCommand({
        type: COMMANDS.SET_TEXT,
        nodeId: node.id,
        oldText: originalText,
        newText: val
      });
      ctx.markLayoutDirty(node.id);
      if (ctx.tab) ctx.tab.isLayoutDirty = true;
      if (node.id === ctx.mindData?.id) {
        if (!ctx.tab.filePath) ctx.tab.title = val;
      }
    }
    onRender();

    if (nextAction === "sibling" && val !== "") {
      addSiblingNode(onRender);
    } else if (nextAction === "child" && val !== "") {
      addChildNode(onRender);
    }
  };

  inlineEditor.onmousedown = (e) => e.stopPropagation();
  inlineEditor.onclick = (e) => e.stopPropagation();
  inlineEditor.ondblclick = (e) => e.stopPropagation();
  inlineEditor.onblur = () => finish("none", false);
  inlineEditor.onkeydown = (e) => {
    e.stopPropagation();
    if (isIMEComposing || e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      if (e.shiftKey) {
        requestAnimationFrame(updateEditorGeometry);
      } else {
        e.preventDefault();
        finish("none", false);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish("child", false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish("none", true);
    }
  };
}
