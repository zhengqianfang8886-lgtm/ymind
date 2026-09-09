// YMind Pro - 物理动效引擎 (收缩向心回缩 + 展开错差绽放 + 兄弟弹簧让位)
import { bus, EVENTS } from "../core/event-bus.js";
import { drawAppleSquircle } from "../geometry/squircle.js";
import { drawNodeContent } from "./node-drawer.js";

class NodeAnimator {
  constructor() {
    this.animatingNodes = new Set();
    this.collapsingList = [];
    this.rafId = null;
    this.lastTime = 0;
    this.initialized = false;
    this.inFrame = false;
  }

  isAnimating(node) {
    return Boolean(node && this.animatingNodes.has(node));
  }

  // 🌟 1. 展开前准备：重置所有子孙节点的动画坐标与透明度，迫使它们从父节点边缘优雅萌芽微弹绽放
  prepareExpand(parentNode) {
    if (!parentNode || !parentNode.children) return;
    const stack = [...parentNode.children];
    while (stack.length > 0) {
      const c = stack.pop();
      if (!c) continue;
      this.animatingNodes.delete(c);
      delete c._curX;
      delete c._curY;
      delete c._vx;
      delete c._vy;
      delete c._delay;
      c._curAlpha = 0.0;
      if (c.children && c.children.length > 0) {
        for (let i = 0; i < c.children.length; i++) stack.push(c.children[i]);
      }
    }
  }

  // 🌟 2. 收起：彻底清除子分支状态，杜绝生硬残影，将舞台留给外围兄弟分支丝滑靠拢收拢
  collapseBranch(parentNode) {
    if (!parentNode || !parentNode.children || parentNode.children.length === 0) return;
    const stack = [...parentNode.children];
    while (stack.length > 0) {
      const curr = stack.pop();
      if (!curr) continue;
      this.animatingNodes.delete(curr);
      delete curr._curX;
      delete curr._curY;
      delete curr._vx;
      delete curr._vy;
      delete curr._delay;
      curr._curAlpha = 1.0;
      if (curr.children && curr.children.length > 0) {
        for (let i = 0; i < curr.children.length; i++) stack.push(curr.children[i]);
      }
    }
  }

 
  track(node, targetX, targetY, parentNode = null, childIndex = 0) {
    if (!this.initialized) {
      node._curX = targetX;
      node._curY = targetY;
      node._curAlpha = 1.0;
      delete node._vx;
      delete node._vy;
      return;
    }

    if (node._curX === undefined || !Number.isFinite(node._curX) || !Number.isFinite(node._curY)) {
      if (parentNode && (Number.isFinite(parentNode._curX) || Number.isFinite(parentNode.x))) {
        const px = Number.isFinite(parentNode._curX) ? parentNode._curX : parentNode.x;
        const py = Number.isFinite(parentNode._curY) ? parentNode._curY : parentNode.y;
        const pw = parentNode.width || 80;
        const ph = parentNode.height || 36;
        const dir = node.branchDirection || "right";

        node._curX = dir === "left" ? px : (dir === "down" ? (px + pw / 2) : (px + pw));
        node._curY = dir === "down" ? (py + ph) : (py + ph / 2 - (node.height || 36) / 2);
        node._curAlpha = 0.0;
        node._delay = Math.min(60, (childIndex || 0) * 16); // 16ms 错差阶梯绽放
      } else {
        node._curX = targetX;
        node._curY = targetY;
        node._curAlpha = 1.0;
        node._delay = 0;
      }
    }

    node._targetX = targetX;
    node._targetY = targetY;
    node._vx = Number.isFinite(node._vx) ? node._vx : 0;
    node._vy = Number.isFinite(node._vy) ? node._vy : 0;

    // 🌟 反向动量制动：当目标急转时消除历史残留动能，杜绝超调震荡导致兄弟节点无法紧凑
    const toDx = targetX - node._curX;
    const toDy = targetY - node._curY;
    if (node._vx * toDx < 0) node._vx = 0;
    if (node._vy * toDy < 0) node._vy = 0;

    const dist = Math.hypot(toDx, toDy);
    if (dist > 0.5 || node._curAlpha < 0.99 || (node._delay && node._delay > 0)) {
      this.animatingNodes.add(node);
      this.startLoop();
    } else {
      node._curX = targetX;
      node._curY = targetY;
      node._curAlpha = 1.0;
      this.animatingNodes.delete(node);
    }
  }

  markInitialized() {
    this.initialized = true;
  }

  stopAll() {
    if (this.rafId) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
    if (this.animatingNodes && typeof this.animatingNodes.clear === "function") {
      this.animatingNodes.clear();
    }
    this.collapsingList = [];
  }

  drawCollapsingNodes() {
    // 兼容历史调用的安全空方法，杜绝 not a function 异常
  }

  startLoop() {
    if (this.rafId) return;
    this.lastTime = performance.now();

    const step = (now) => {
      this.inFrame = true;
      const dt = Math.min(0.032, (now - this.lastTime) / 1000);
      this.lastTime = now;
      let stillActive = false;

      const tension = 320;
      const friction = 30;

      for (const node of this.animatingNodes) {
        if (!Number.isFinite(node._curX) || !Number.isFinite(node._curY) ||
            !Number.isFinite(node._targetX) || !Number.isFinite(node._targetY)) {
          node._curX = Number.isFinite(node._targetX) ? node._targetX : (node.x || 0);
          node._curY = Number.isFinite(node._targetY) ? node._targetY : (node.y || 0);
          node._curAlpha = 1.0;
          node._vx = 0;
          node._vy = 0;
          this.animatingNodes.delete(node);
          continue;
        }

        if (node._delay > 0) {
          node._delay -= dt * 1000;
          stillActive = true;
          continue;
        }

        const dx = node._curX - node._targetX;
        const ax = -tension * dx - friction * node._vx;
        node._vx += ax * dt;
        node._curX += node._vx * dt;

        const dy = node._curY - node._targetY;
        const ay = -tension * dy - friction * node._vy;
        node._vy += ay * dt;
        node._curY += node._vy * dt;

        if (node._curAlpha < 1.0) {
          node._curAlpha = Math.min(1.0, node._curAlpha + dt * 5.0);
        }

        const isSettledX = Math.abs(node._curX - node._targetX) < 0.8 && Math.abs(node._vx) < 0.6;
        const isSettledY = Math.abs(node._curY - node._targetY) < 0.8 && Math.abs(node._vy) < 0.6;
        const isSettledAlpha = node._curAlpha >= 0.98;

        if (isSettledX && isSettledY && isSettledAlpha) {
          node._curX = node._targetX;
          node._curY = node._targetY;
          node._curAlpha = 1.0;
          node._vx = 0;
          node._vy = 0;
          this.animatingNodes.delete(node);
        } else {
          stillActive = true;
        }
      }

      this.inFrame = false;
      bus.emit(EVENTS.RENDER_CANVAS_ONLY);

      // 🌟 核心防死锁：只要集合中仍有节点，哪怕上一波在当前帧结束，也必须继续调度下一帧
      if (this.animatingNodes.size > 0) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(step);
  }
  drawCollapsingNodes() {}

}

export const nodeAnimator = new NodeAnimator();
