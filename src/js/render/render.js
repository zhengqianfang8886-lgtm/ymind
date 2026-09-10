import { computeLayout, assignCoordinates, ensureLayoutReady, getActiveFontFamily, MAX_NODE_TEXT_WIDTH, MAX_ROOT_TEXT_WIDTH, getTextLineWidth, wrapTextLines } from "../geometry/layout.js";
import { state, findNode, getActiveTab, getAncestors, findParent, getActiveDocumentContext } from "../core/state.js";
import { saveSnapshot, executeCommand, COMMANDS } from "../core/history.js";
import { camera, locateFocusedNode, smartAdaptiveCenter, stopAllCameraAnimations } from "../core/camera.js";
import { updateMinimap, syncMinimapViewportBox } from "./minimap.js";
import { drawAppleSquircle } from "../geometry/squircle.js";
import { startNodeEdit, syncInlineEditorPosition, getNodeEditorMetrics } from "../ui/inline-editor.js";
import { drawNodeContent } from "./node-drawer.js";
import { bus, EVENTS } from "../core/event-bus.js";
import { nodeAnimator } from "./node-animator.js";

export { startNodeEdit as startEditNode, syncInlineEditorPosition, getNodeEditorMetrics };
export { ensureLayoutReady };

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

const canvas = document.getElementById("canvas-main");
const inlineEditor = document.getElementById("inline-editor");
const viewport = document.getElementById("viewport");

let cachedVpWidth = 0, cachedVpHeight = 0, cachedDpr = 0;

export function resizeCanvas(force = false) {
  if (!canvas || !viewport) return;
  const dpr = window.devicePixelRatio || 1;
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;

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

function appendTaperedRibbon(path, node, child, isPrimary, boxStyle, s) {
  const isDown = child.branchDirection === "down";
  const isLeft = child.branchDirection === "left";
  const isParentUnderline = boxStyle === "underline";
  const isChildUnderline = boxStyle === "underline";

  const hasBadge = !isPrimary && node.children && node.children.length > 0;
  const badgeClearance = hasBadge ? 7.2 : 0;

  const nx1 = (node._curX !== undefined) ? node._curX : node.x;
  const ny1 = (node._curY !== undefined) ? node._curY : node.y;
  const nx2 = (child._curX !== undefined) ? child._curX : child.x;
  const ny2 = (child._curY !== undefined) ? child._curY : child.y;

  let x1, y1, x2, y2;
  if (isDown) {
    x1 = nx1 + node.width / 2;
    y1 = ny1 + node.height + badgeClearance;
    x2 = nx2 + child.width / 2;
    y2 = ny2;
  } else if (isLeft) {
    x1 = nx1 - badgeClearance;
    x2 = nx2 + child.width;
    y2 = isChildUnderline ? (ny2 + child.height) : (ny2 + child.height / 2);
    y1 = isParentUnderline ? (ny1 + node.height) : (ny1 + node.height / 2);
  } else {
    x1 = nx1 + node.width + badgeClearance;
    x2 = nx2;
    y2 = isChildUnderline ? (ny2 + child.height) : (ny2 + child.height / 2);
    y1 = isParentUnderline ? (ny1 + node.height) : (ny1 + node.height / 2);
  }

  const w1 = isPrimary ? (4.6 / s) : (2.4 / s);
  const w2 = isPrimary ? (2.6 / s) : (1.8 / s);
  const r1 = w1 / 2;
  const r2 = w2 / 2;
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (isDown) {
    const tension = Math.min(Math.abs(dy) * 0.45, Math.abs(dx) * 0.65);
    const cp1Y = y1 + Math.max(16, tension);
    const cp2Y = y2 - Math.max(16, tension);
    path.moveTo(x1 - r1, y1);
    path.bezierCurveTo(x1 - r1, cp1Y, x2 - r2, cp2Y, x2 - r2, y2);
    path.lineTo(x2 + r2, y2);
    path.bezierCurveTo(x2 + r2, cp2Y, x1 + r1, cp1Y, x1 + r1, y1);
    path.closePath();
  } else {
    const isDirectionMismatch = isLeft ? (dx > -5) : (dx < 5);
    if (Math.abs(dx) < 8 || isDirectionMismatch) {
      path.moveTo(x1, y1 - r1);
      path.lineTo(x2, y2 - r2);
      path.lineTo(x2, y2 + r2);
      path.lineTo(x1, y1 + r1);
      path.closePath();
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

  const nx1 = (node._curX !== undefined) ? node._curX : node.x;
  const ny1 = (node._curY !== undefined) ? node._curY : node.y;
  const nx2 = (child._curX !== undefined) ? child._curX : child.x;
  const ny2 = (child._curY !== undefined) ? child._curY : child.y;

  let x1, y1, x2, y2;
  if (isDown) {
    x1 = nx1 + node.width / 2;
    y1 = ny1 + node.height;
    x2 = nx2 + child.width / 2;
    y2 = ny2;
  } else if (isLeft) {
    x1 = nx1;
    x2 = nx2 + child.width;
    y2 = isChildUnderline ? (ny2 + child.height) : (ny2 + child.height / 2);
    y1 = isParentUnderline ? (ny1 + node.height) : (ny1 + node.height / 2);
  } else {
    x1 = nx1 + node.width;
    x2 = nx2;
    y2 = isChildUnderline ? (ny2 + child.height) : (ny2 + child.height / 2);
    y1 = isParentUnderline ? (ny1 + node.height) : (ny1 + node.height / 2);
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

  const nx = (node._curX !== undefined) ? node._curX : node.x;
  const ny = (node._curY !== undefined) ? node._curY : node.y;
  if (isRootOfView || isRectVisible(nx, ny, node.width, node.height, vpBounds)) {
    visibleNodes.push({ node, level, isRootOfView });
  }
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
  ensureLayoutReady(curTab, docCtx.isLayoutDirty);

  const dpr = window.devicePixelRatio || 1;
  const vpW = cachedVpWidth || window.innerWidth;
  const vpH = cachedVpHeight || window.innerHeight;
  const s = camera.transform.scale;
  const isUltraLOD = s < 0.25;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

    // 1. 连线层绘制
    ctx.lineWidth = secondaryStrokeWidth;
    secondaryBatches.forEach((path, color) => { ctx.strokeStyle = color; ctx.stroke(path); });

    ctx.lineWidth = primaryStrokeWidth;
    primaryBatches.forEach((path, color) => { ctx.strokeStyle = color; ctx.stroke(path); });

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

    // 2. 节点背景与选框绘制 (单体闭环，绝无矩阵叠乘)
    for (let i = 0; i < visibleNodes.length; i++) {
      const { node, level, isRootOfView } = visibleNodes[i];
      const isSelected = docCtx.selectedIds.has(node.id);
      const r = isRootOfView ? 11 : (level === 1 ? 8 : 6.5);
      const nx = (node._curX !== undefined && Number.isFinite(node._curX)) ? node._curX : node.x;
      const ny = (node._curY !== undefined && Number.isFinite(node._curY)) ? node._curY : node.y;

      if (isUltraLOD && !isRootOfView) {
        ctx.fillStyle = node.colorTheme ? (node.colorTheme.solid || node.colorTheme.border) : "#94a3b8";
        ctx.fillRect(nx, ny, node.width, node.height);
        continue;
      }

      ctx.save();
      const nodeAlpha = (node._curAlpha !== undefined && Number.isFinite(node._curAlpha)) ? Math.max(0, Math.min(1, node._curAlpha)) : 1.0;
      if (nodeAlpha < 0.99) {
        ctx.globalAlpha = nodeAlpha;
      }

      if (boxStyle !== "underline") {
        if (boxStyle === "rect" || s < 0.35) {
          ctx.beginPath();
          ctx.rect(nx, ny, node.width, node.height);
        } else {
          drawAppleSquircle(ctx, nx, ny, node.width, node.height, r);
        }

        if (isRootOfView) {
          if (enableShadows) {
            ctx.shadowColor = "rgba(0, 113, 227, 0.25)";
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 2;
          }
          const grad = ctx.createLinearGradient(nx, ny, nx, ny + node.height);
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
      } else {
        ctx.beginPath();
        ctx.moveTo(nx, ny + node.height);
        ctx.lineTo(nx + node.width, ny + node.height);
        const defaultColor = node.colorTheme ? node.colorTheme.line : (isDarkCanvas ? "#94a3b8" : "#86868b");
        ctx.strokeStyle = isSelected ? (isDarkCanvas ? "#38bdf8" : "#0071e3") : defaultColor;
        const defaultUnderlineWidth = isRootOfView ? (2.8 / s) : (2.2 / s);
        ctx.lineWidth = isSelected ? (3.4 / s) : defaultUnderlineWidth;
        ctx.stroke();
      }

      if (isSelected) {
        const offset = 2.5;
        if (boxStyle === "underline") {
          const padX = 4, padY = 3;
          ctx.beginPath();
          drawAppleSquircle(ctx, nx - padX, ny - padY, node.width + padX * 2, node.height + padY * 2, 6);
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
          ctx.rect(nx - offset, ny - offset, node.width + offset * 2, node.height + offset * 2);
          if (enableShadows) {
            ctx.shadowColor = "rgba(0, 113, 227, 0.35)";
            ctx.shadowBlur = 6;
          }
          ctx.strokeStyle = "#0071e3";
          ctx.lineWidth = 2.6 / s;
          ctx.stroke();
        } else {
          ctx.beginPath();
          drawAppleSquircle(ctx, nx - offset, ny - offset, node.width + offset * 2, node.height + offset * 2, r + 2);
          if (enableShadows) {
            ctx.shadowColor = "rgba(0, 113, 227, 0.35)";
            ctx.shadowBlur = 6;
          }
          ctx.strokeStyle = "#0071e3";
          ctx.lineWidth = 2.6 / s;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3. 节点文本与徽章内容绘制 (严格单体作用域恢复)
    for (let i = 0; i < visibleNodes.length; i++) {
      const { node, level, isRootOfView } = visibleNodes[i];
      const nx = (node._curX !== undefined && Number.isFinite(node._curX)) ? node._curX : node.x;
      const ny = (node._curY !== undefined && Number.isFinite(node._curY)) ? node._curY : node.y;
      const savedX = node.x;
      const savedY = node.y;

      node.x = nx;
      node.y = ny;

      ctx.save();
      const nodeAlpha = (node._curAlpha !== undefined && Number.isFinite(node._curAlpha)) ? Math.max(0, Math.min(1, node._curAlpha)) : 1.0;
      if (nodeAlpha < 0.99) {
        ctx.globalAlpha = nodeAlpha;
      }
      drawNodeContent(ctx, node, level, isRootOfView, docCtx, s);
      ctx.restore();

      node.x = savedX;
      node.y = savedY;
    }

  

  } finally {
    ctx.restore();
  }

  updateBreadcrumbs(docCtx, (id) => {
    docCtx.focusBranch(id);
    callbacks.onRender();
    smartAdaptiveCenter(null, true, docCtx);
  });

  updateMinimap();
  renderInteractiveLayer();
  syncInlineEditorPosition();
}

let gCachedBreadcrumbSig = null;
export function resetBreadcrumbSig() {
  gCachedBreadcrumbSig = null;
}

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
    const safeId = String(node.id).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    return `
      <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-id="${safeId}" title="${safeTitle}">${safeTitle}</span>
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

bus.on(EVENTS.START_NODE_EDIT, ({ node, isNewNode, ctx }) => {
  startNodeEdit(node, state, () => bus.emit(EVENTS.RENDER_APP), isNewNode, ctx);
});
