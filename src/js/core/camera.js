import { state, getActiveTab, findNode, findParent, getPrimarySelectedNode } from "./state.js";
import { getGlobalSettings } from "./config.js";
import { bus, EVENTS } from "./event-bus.js";
import { computeLayout, assignCoordinates } from "../geometry/layout.js";
import { canvasMachine, CanvasState } from "../interaction/canvas-machine.js";

const safeRaf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
const safeCaf = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : (id) => clearTimeout(id);

export const camera = {
  transform: {
    x: typeof window !== "undefined" ? window.innerWidth / 2 - 60 : 400,
    y: typeof window !== "undefined" ? window.innerHeight / 2 - 30 : 300,
    scale: 1
  },
  isTransformPending: false,
  cameraAnimationId: null,
  inertiaAnimationId: null
};

function syncTabCamera() {
  const curTab = getActiveTab();
  if (curTab) curTab.camera = { ...camera.transform };
}

export function requestTransformUpdate() {
  if (camera.isTransformPending) return;
  camera.isTransformPending = true;
  safeRaf(() => {
    bus.emit(EVENTS.RENDER_CANVAS_ONLY);
    bus.emit(EVENTS.TRANSFORM_CHANGE, camera.transform);
    camera.isTransformPending = false;
  });
}

export function startInertiaMomentum(vx, vy) {
  if (camera.inertiaAnimationId) cancelAnimationFrame(camera.inertiaAnimationId);

  canvasMachine.transition(CanvasState.ANIMATING);
  const maxVel = 2.0;
  let curVx = Math.max(-maxVel, Math.min(maxVel, vx));
  let curVy = Math.max(-maxVel, Math.min(maxVel, vy));

  let lastTime = performance.now();
  const friction = 0.0085;

  function momentumStep(now) {
    const dt = Math.min(now - lastTime, 24);
    lastTime = now;
    const speed = Math.hypot(curVx, curVy);

    if (speed < 0.02) {
      camera.inertiaAnimationId = null;
      canvasMachine.transition(CanvasState.IDLE);
      syncTabCamera();
      requestTransformUpdate();
      return;
    }

    camera.transform.x += curVx * dt;
    camera.transform.y += curVy * dt;

    const decay = Math.exp(-friction * dt);
    curVx *= decay;
    curVy *= decay;

    requestTransformUpdate();
    camera.inertiaAnimationId = safeRaf(momentumStep);
  }
  camera.inertiaAnimationId = safeRaf(momentumStep);
}

export function stopAllCameraAnimations() {
  if (camera.cameraAnimationId) {
    safeCaf(camera.cameraAnimationId);
    camera.cameraAnimationId = null;
  }
  if (camera.inertiaAnimationId) {
    safeCaf(camera.inertiaAnimationId);
    camera.inertiaAnimationId = null;
  }
  if (canvasMachine.is(CanvasState.ANIMATING)) {
    canvasMachine.transition(CanvasState.IDLE);
  }
}

export function springAnimateTo(targetX, targetY, targetScale = camera.transform.scale, tension = 160, friction = 24) {
  stopAllCameraAnimations();
  canvasMachine.transition(CanvasState.ANIMATING);

  let curX = camera.transform.x, curY = camera.transform.y, curS = camera.transform.scale;
  let vx = 0, vy = 0, vs = 0;
  let lastTime = performance.now();

  function springStep(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.032);
    lastTime = now;

    const dx = curX - targetX;
    const dy = curY - targetY;
    const ds = curS - targetScale;

    // 🌟 仿生动态阻尼：随距离自适应调节刚度，消除远距离瞬间爆发的初速度猛烈冲击 (Anti-Jerk)
    const dist = Math.hypot(dx, dy);
    const dynamicTension = dist > 600 ? tension * Math.max(0.65, 600 / dist) : tension;
    const dynamicFriction = friction * (dist > 600 ? 1.15 : 1.0);

    const ax = -dynamicTension * dx - dynamicFriction * vx;
    const ay = -dynamicTension * dy - dynamicFriction * vy;
    const as = -tension * ds - (friction * 1.1) * vs;

    vx += ax * dt;
    vy += ay * dt;
    vs += as * dt;

    curX += vx * dt;
    curY += vy * dt;
    curS += vs * dt;

    camera.transform.x = curX;
    camera.transform.y = curY;
    camera.transform.scale = curS;
    requestTransformUpdate();

    const isResting = Math.abs(curX - targetX) < 0.35 &&
                      Math.abs(curY - targetY) < 0.35 &&
                      Math.abs(curS - targetScale) < 0.0015 &&
                      Math.hypot(vx, vy, vs) < 0.08;

    if (isResting) {
      camera.transform.x = targetX;
      camera.transform.y = targetY;
      camera.transform.scale = targetScale;
      camera.cameraAnimationId = null;
      canvasMachine.transition(CanvasState.IDLE);
      syncTabCamera();
      requestTransformUpdate();
    } else {
      camera.cameraAnimationId = safeRaf(springStep);
    }
  }
  camera.cameraAnimationId = safeRaf(springStep);
}

// 🌟 深度打磨自适应定焦：侧边栏感知、多级上下文黄金分割、防突兀抗震颤
export function smartAdaptiveCenter(nodeOrId = null, animated = true, customCtx = null) {
  const ctx = (customCtx && customCtx.tab) ? customCtx : (getActiveTab()?._context || null);
  const currentRoot = ctx ? (findNode(ctx.focusedRootId, ctx.mindData) || ctx.mindData) : null;
  if (!currentRoot) return;

  const hasDoc = typeof document !== "undefined";
  const hasWin = typeof window !== "undefined";
  const vp = hasDoc ? document.getElementById("viewport") : null;

  // 🌟 侧边栏感知：若检查器展开，自动将目标可见中心偏置，绝不遮挡节点
  const isSidebarOpen = Boolean(
    hasDoc && (
      document.querySelector(".workspace-body-layout.sidebar-open") ||
      (document.getElementById("format-sidebar") && !document.getElementById("format-sidebar").classList.contains("collapsed"))
    )
  );
  const sidebarW = isSidebarOpen ? 336 : 0;
  const screenW = vp?.clientWidth || (hasWin ? window.innerWidth : 1200);
  const usableW = Math.max(240, screenW - sidebarW);
  const usableH = vp?.clientHeight || (hasWin ? window.innerHeight : 800);
  const usableCenterX = usableW / 2;
  const usableCenterY = usableH / 2;

  // 若节点未曾计算过坐标，先跑一次几何解算
  if (currentRoot.x === undefined || currentRoot.y === undefined) {
    computeLayout(currentRoot, 0, ctx.focusedRootId, ctx.layoutStructure, ctx.nodeSpacing || "normal");
    assignCoordinates(currentRoot, 0, 0, ctx.focusedRootId, ctx.layoutStructure, null, null, ctx.colorPalette || "apple-classic", ctx.nodeSpacing || "normal", ctx.spatialIndex);
    ctx.isLayoutDirty = false;
  }

  let targetNode = currentRoot;
  if (typeof nodeOrId === "string") {
    targetNode = findNode(nodeOrId, currentRoot) || currentRoot;
  } else if (nodeOrId && typeof nodeOrId === "object" && nodeOrId.id) {
    targetNode = nodeOrId;
  }

  const rootId = ctx.focusedRootId || currentRoot.id;
  const isTargetRoot = targetNode.id === rootId && !nodeOrId;
  const hasExpandedChildren = Boolean(targetNode.children && targetNode.children.length > 0 && !targetNode.collapsed);

  let targetScale = camera.transform.scale;
  let centerX, centerY;

  if (isTargetRoot) {
    // 🌟 1. 全图全景回正：精确测算全景包围盒，自适应缩放呈现全貌
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    function scanTree(n) {
      if (n.x !== undefined && n.y !== undefined) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x + (n.width || 80));
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y + (n.height || 36));
      }
      if (n.children && !n.collapsed) n.children.forEach(scanTree);
    }
    scanTree(currentRoot);

    if (minX === Infinity) {
      minX = 0; maxX = currentRoot.width || 120;
      minY = 0; maxY = currentRoot.height || 44;
    }

    const padX = Math.max(80, usableW * 0.12);
    const padY = Math.max(60, usableH * 0.12);
    const totalW = (maxX - minX) + padX * 2;
    const totalH = (maxY - minY) + padY * 2;

    const fitScale = Math.min(usableW / totalW, usableH / totalH);
    targetScale = Math.max(0.25, Math.min(1.05, fitScale));
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
  } else if (hasExpandedChildren) {
    // 🌟 2. 展开分支群组聚焦：兼顾包围盒与用户当前阅读比例，拒绝突兀暴缩
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    function scanBranch(n) {
      if (n.x !== undefined && n.y !== undefined) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x + (n.width || 80));
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y + (n.height || 36));
      }
      if (n.children && !n.collapsed) n.children.forEach(scanBranch);
    }
    scanBranch(targetNode);

    const padX = 90, padY = 70;
    const totalW = (maxX - minX) + padX * 2;
    const totalH = (maxY - minY) + padY * 2;
    const fitScale = Math.min(usableW / totalW, usableH / totalH);

    // 若当前缩放比例能较为舒适地容纳分支（未严重溢出），尽量维持用户当前阅读比例
    if (targetScale * totalW <= usableW * 1.15 && targetScale * totalH <= usableH * 1.15 && targetScale >= 0.65 && targetScale <= 1.25) {
      // 保持当前 scale
    } else {
      targetScale = Math.max(0.45, Math.min(1.15, fitScale));
    }

    // 朝分支生长方向做微黄金比例偏置（前向预留视野）
    const dir = targetNode.branchDirection;
    const biasX = dir === "right" ? -15 : (dir === "left" ? 15 : 0);
    centerX = (minX + maxX) / 2 + biasX;
    centerY = (minY + maxY) / 2;
  } else {
    // 🌟 3. 单节点高精定焦：严格以目标节点为视觉重心，绝不再强行回退父节点导致错乱跳动
    const nodeW = targetNode.width || 80;
    const nodeH = targetNode.height || 36;
    centerX = targetNode.x + nodeW / 2;
    centerY = targetNode.y + nodeH / 2;

    // 保持舒适度，仅在极端过小/过大时微调
    if (targetScale < 0.7) targetScale = 0.88;
    else if (targetScale > 1.35) targetScale = 1.15;
  }

  const targetX = usableCenterX - centerX * targetScale;
  const targetY = usableCenterY - centerY * targetScale;

  if (animated) {
    springAnimateTo(targetX, targetY, targetScale, 170, 22);
  } else {
    stopAllCameraAnimations();
    camera.transform.x = targetX;
    camera.transform.y = targetY;
    camera.transform.scale = targetScale;
    syncTabCamera();
    requestTransformUpdate();
  }
}

// 统一的视口中心定比缩放
export function zoomViewportByFactor(factor) {
  const vp = document.getElementById("viewport");
  const cx = (vp?.clientWidth || window.innerWidth) / 2;
  const cy = (vp?.clientHeight || window.innerHeight) / 2;
  const oldScale = camera.transform.scale;
  const newScale = Math.min(3.0, Math.max(0.15, oldScale * factor));
  camera.transform.x = cx - (cx - camera.transform.x) * (newScale / oldScale);
  camera.transform.y = cy - (cy - camera.transform.y) * (newScale / oldScale);
  camera.transform.scale = newScale;
  syncTabCamera();
  requestTransformUpdate();
}

// 统一的 100% 居中复位
export function resetZoom100() {
  const vp = document.getElementById("viewport");
  const cx = (vp?.clientWidth || window.innerWidth) / 2;
  const cy = (vp?.clientHeight || window.innerHeight) / 2;
  const oldScale = camera.transform.scale;
  camera.transform.x = cx - (cx - camera.transform.x) * (1.0 / oldScale);
  camera.transform.y = cy - (cy - camera.transform.y) * (1.0 / oldScale);
  camera.transform.scale = 1.0;
  syncTabCamera();
  requestTransformUpdate();
}

export function locateFocusedNode(nodeOrId = null, animated = true, customCtx = null, intent = "click") {
  const followMode = getGlobalSettings().focusFollowMode || "smooth";
  if (followMode === "off") return;

  const ctx = (customCtx && customCtx.tab) ? customCtx : (getActiveTab()?._context || null);
  const root = ctx?.mindData;
  if (!root) return;

  const hasDoc = typeof document !== "undefined";
  const hasWin = typeof window !== "undefined";
  const vp = hasDoc ? document.getElementById("viewport") : null;

  let targetNode = null;
  if (typeof nodeOrId === "string") targetNode = findNode(nodeOrId, root);
  else if (nodeOrId && typeof nodeOrId === "object" && nodeOrId.id) targetNode = nodeOrId;
  else targetNode = getPrimarySelectedNode(ctx);

  if (!targetNode || targetNode.x === undefined) return;

  const isSidebarOpen = Boolean(
    hasDoc && (
      document.querySelector(".workspace-body-layout.sidebar-open") ||
      (document.getElementById("format-sidebar") && !document.getElementById("format-sidebar").classList.contains("collapsed"))
    )
  );
  const sidebarW = isSidebarOpen ? 336 : 0;
  const screenW = vp?.clientWidth || (hasWin ? window.innerWidth : 1200);
  const usableW = Math.max(240, screenW - sidebarW);
  const screenH = vp?.clientHeight || (hasWin ? window.innerHeight : 800);
  const currentScale = camera.transform.scale;
  const usableCenterX = usableW / 2;
  const usableCenterY = screenH / 2;

  const nodeScreenX = targetNode.x * currentScale + camera.transform.x;
  const nodeScreenY = targetNode.y * currentScale + camera.transform.y;
  const nodeScreenW = (targetNode.width || 80) * currentScale;
  const nodeScreenH = (targetNode.height || 36) * currentScale;

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

  if (animated && followMode === "smooth") {
    springAnimateTo(targetX, targetY, currentScale, 190, 24);
  } else {
    stopAllCameraAnimations();
    camera.transform.x = targetX;
    camera.transform.y = targetY;
    syncTabCamera();
    requestTransformUpdate();
  }
}

export function smartCenterOnSelectedNode(stateRef, animated = true, customCtx = null) { smartAdaptiveCenter(null, animated, customCtx); }
export function ensureNodeVisible(nodeOrId = null, animated = true) { locateFocusedNode(nodeOrId, animated, null, "center"); }
