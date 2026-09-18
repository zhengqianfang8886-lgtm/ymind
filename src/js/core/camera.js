import { state, getActiveTab, findNode, findParent, getPrimarySelectedNode, walkTree } from "./state.js";
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
export function smartAdaptiveCenter(nodeOrId = null, animated = true, customCtx = null, fitScale = false) {
  const ctx = (customCtx && customCtx.tab) ? customCtx : (getActiveTab()?._context || null);
  const currentRoot = ctx ? (findNode(ctx.focusedRootId, ctx.mindData) || ctx.mindData) : null;
  if (!currentRoot) return;

  const hasDoc = typeof document !== "undefined";
  const hasWin = typeof window !== "undefined";
  const vp = hasDoc ? document.getElementById("viewport") : null;

  // 侧边栏感知对齐
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

  // 🌟 核心铁律：默认 100% 锁定并保留用户当前的视口缩放比例，绝不擅自篡改！
  let targetScale = camera.transform.scale;
  let centerX, centerY;

  if (fitScale) {
    // 仅在用户明确主动触发（如点击“自适应居中”或双击空白处）时，才计算全景缩放比
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of walkTree(targetNode, { skipCollapsed: true })) {
      if (n.x !== undefined && n.y !== undefined) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x + (n.width || 80));
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y + (n.height || 36));
      }
    }

    if (minX === Infinity) {
      minX = targetNode.x || 0;
      maxX = minX + (targetNode.width || 80);
      minY = targetNode.y || 0;
      maxY = minY + (targetNode.height || 36);
    }

    const padX = Math.max(80, usableW * 0.12);
    const padY = Math.max(60, usableH * 0.12);
    const totalW = (maxX - minX) + padX * 2;
    const totalH = (maxY - minY) + padY * 2;

    const calculatedFit = Math.min(usableW / totalW, usableH / totalH);
    targetScale = Math.max(0.25, Math.min(1.05, calculatedFit));
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
  } else {
    // 🌟 视距锁定模式：仅平移对齐几何重心，保持当前 targetScale 绝对恒定
    const hasExpandedChildren = Boolean(targetNode.children && targetNode.children.length > 0 && !targetNode.collapsed);
    if (targetNode.id === (ctx.focusedRootId || currentRoot.id) || hasExpandedChildren) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of walkTree(targetNode, { skipCollapsed: true })) {
        if (n.x !== undefined && n.y !== undefined) {
          minX = Math.min(minX, n.x);
          maxX = Math.max(maxX, n.x + (n.width || 80));
          minY = Math.min(minY, n.y);
          maxY = Math.max(maxY, n.y + (n.height || 36));
        }
      }
      if (minX === Infinity) {
        minX = targetNode.x || 0;
        maxX = minX + (targetNode.width || 80);
        minY = targetNode.y || 0;
        maxY = minY + (targetNode.height || 36);
      }
      centerX = (minX + maxX) / 2;
      centerY = (minY + maxY) / 2;
    } else {
      const nodeW = targetNode.width || 80;
      const nodeH = targetNode.height || 36;
      centerX = targetNode.x + nodeW / 2;
      centerY = targetNode.y + nodeH / 2;
    }
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

  const nodeCenterScreenX = nodeScreenX + nodeScreenW / 2;
  const nodeCenterScreenY = nodeScreenY + nodeScreenH / 2;

  let glanceX = nodeScreenX;
  let glanceY = nodeScreenY;
  let glanceW = nodeScreenW;
  let glanceH = nodeScreenH;

  const isCenter = intent === true || intent === "center";
  const isCreate = intent === "create";
  const isKeyboard = intent === "keyboard";

  // 分支第一级子节点边界预判
  if (!isCenter && (isKeyboard || isCreate) && targetNode.children && !targetNode.collapsed && targetNode.children.length > 0) {
    const firstChild = targetNode.children[0];
    const lastChild = targetNode.children[targetNode.children.length - 1];
    if (firstChild && firstChild.x !== undefined && lastChild && lastChild.y !== undefined) {
      const branchTop = Math.min(nodeScreenY, firstChild.y * currentScale + camera.transform.y);
      const branchBottom = Math.max(nodeScreenY + nodeScreenH, (lastChild.y + (lastChild.height || 36)) * currentScale + camera.transform.y);
      glanceY = branchTop;
      glanceH = Math.min(screenH * 0.72, branchBottom - branchTop);

      if (targetNode.branchDirection === "right") {
        const childRight = (firstChild.x + Math.min(firstChild.width || 80, 160)) * currentScale + camera.transform.x;
        glanceW = Math.max(nodeScreenW, childRight - nodeScreenX);
      } else if (targetNode.branchDirection === "left") {
        const childLeft = (firstChild.x + Math.max(0, (firstChild.width || 80) - 160)) * currentScale + camera.transform.x;
        glanceX = Math.min(nodeScreenX, childLeft);
        glanceW = (nodeScreenX + nodeScreenW) - glanceX;
      }
    }
  }

    let deltaX = 0;
  let deltaY = 0;
  let springTension = 145;
  let springFriction = 24;

  if (isCenter) {
    // 🌟 策略 1 [搜索/双链/全局聚焦]：明确的全局居中定焦
    deltaX = usableCenterX - nodeCenterScreenX;
    deltaY = usableCenterY - nodeCenterScreenY;
    springTension = 150;
    springFriction = 24;
  } else if (isCreate) {
    // 🌟 策略 2 [Tab/Enter 新建分支]：前瞻留白 (Forward Cushion ~14%)
    const cushionX = Math.round(usableW * 0.14);
    const cushionY = Math.round(screenH * 0.08);
    const targetDir = targetNode.branchDirection;

    if (targetDir === "right") {
      const rightBoundary = usableW - 56;
      if (glanceX + glanceW + cushionX > rightBoundary) {
        deltaX = rightBoundary - (glanceX + glanceW + cushionX);
      }
    } else if (targetDir === "left") {
      const leftBoundary = 56;
      if (glanceX - cushionX < leftBoundary) {
        deltaX = leftBoundary - (glanceX - cushionX);
      }
    }

    if (glanceY < 56) {
      deltaY = 56 - glanceY;
    } else if (glanceY + glanceH + cushionY > screenH - 56) {
      deltaY = (screenH - 56) - (glanceY + glanceH + cushionY);
    }
    springTension = 160;
    springFriction = 25;
  } else {
    // 🌟 统一采用方向键验证优秀的「视口边缘吸附 (Edge Clamp)」算法
    // 1. 节点在视口内清晰可见时：相机绝对静止 (0位移，彻底消除鼠标点击的频繁摇晃)
    // 2. 仅当节点被侧边栏遮挡、触碰视口边界或在屏幕外时：最小平滑推入舒适视野内
    const marginX = Math.min(80, Math.max(48, usableW * 0.08));
    const marginY = Math.min(72, Math.max(40, screenH * 0.08));
    const stepBuffer = 36;

    if (glanceX < marginX) {
      deltaX = (marginX + stepBuffer) - glanceX;
    } else if (glanceX + glanceW > usableW - marginX) {
      deltaX = (usableW - marginX - stepBuffer) - (glanceX + glanceW);
    }

    if (glanceY < marginY) {
      deltaY = (marginY + stepBuffer) - glanceY;
    } else if (glanceY + glanceH > screenH - marginY) {
      deltaY = (screenH - marginY - stepBuffer) - (glanceY + glanceH);
    }
    springTension = 170;
    springFriction = 26;
  }

  // 超宽节点阅读起始侧保护
  if (nodeScreenW > usableW - 72) {
    if (targetNode.branchDirection === "left") {
      deltaX = (usableW - 48) - (nodeScreenX + nodeScreenW);
    } else {
      deltaX = 48 - nodeScreenX;
    }
  }

  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

  const targetX = camera.transform.x + deltaX;
  const targetY = camera.transform.y + deltaY;

  if (animated && followMode === "smooth") {
    springAnimateTo(targetX, targetY, currentScale, springTension, springFriction);
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
