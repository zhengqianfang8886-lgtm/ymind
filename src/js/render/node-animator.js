
// 🌟 Apple 原生微质感动效体系：待办打勾弹簧阻尼 (Spring Pop) 与圆弧平滑缓动 (Arc Interpolation)
export const todoMicroAnimator = {
  // node.id -> { scale: 1.0, targetScale: 1.0, checkProgress: 1.0, currentAngle: targetAngle, targetAngle: number, active: boolean }
  states: new Map(),

  getState(nodeId, defaultAngle = 0, isDone = false) {
    if (!this.states.has(nodeId)) {
      this.states.set(nodeId, {
        scale: 1.0,
        velScale: 0,
        targetScale: 1.0,
        checkProgress: isDone ? 1.0 : 0.0,
        currentAngle: defaultAngle,
        targetAngle: defaultAngle,
        colorRatio: 1.0,
        active: false
      });
    }
    return this.states.get(nodeId);
  },

  triggerCheck(nodeId, nextDone) {
    let s = this.states.get(nodeId);
    if (!s) {
      s = this.getState(nodeId, 0, !nextDone);
    }
    s.active = true;
    if (nextDone) {
      // 弹性爆发：先向内瞬缩，再向外超调反弹 (Apple Reminders Pop)
      s.scale = 0.72;
      s.velScale = 14.5;
      s.targetScale = 1.0;
      s.checkProgress = 0.0;
    } else {
      s.scale = 0.85;
      s.velScale = 4.0;
      s.targetScale = 1.0;
      s.checkProgress = 0.0;
    }
    nodeAnimator.startLoop();
  },

  setTargetProgress(nodeId, targetAngle) {
    const s = this.getState(nodeId, targetAngle);
    if (Math.abs(s.targetAngle - targetAngle) > 0.01) {
      s.targetAngle = targetAngle;
      s.active = true;
      nodeAnimator.startLoop();
    }
  },

  update(dt) {
    let anyActive = false;
    const tension = 260; // 弹簧刚度
    const friction = 22; // 阻尼衰减

    for (const [id, s] of this.states.entries()) {
      if (!s.active) continue;

      // 1. 物理弹簧缩放解算 (Spring Physics for Checkbox)
      const dx = s.scale - s.targetScale;
      const ax = -tension * dx - friction * s.velScale;
      s.velScale += ax * dt;
      s.scale += s.velScale * dt;

      // 2. 对勾生长动画 (Checkmark draw-on)
      if (s.checkProgress < 1.0) {
        s.checkProgress = Math.min(1.0, s.checkProgress + dt * 6.5);
      }

      // 3. 圆弧连续旋转补间 (Smooth Arc Interpolation)
      const angleDiff = s.targetAngle - s.currentAngle;
      s.currentAngle += angleDiff * Math.min(1.0, dt * 12.0);

      const isScaleSettled = Math.abs(dx) < 0.005 && Math.abs(s.velScale) < 0.05;
      const isAngleSettled = Math.abs(angleDiff) < 0.008;

      if (isScaleSettled && isAngleSettled && s.checkProgress >= 0.99) {
        s.scale = 1.0;
        s.velScale = 0;
        s.currentAngle = s.targetAngle;
        s.checkProgress = 1.0;
        s.active = false;
      } else {
        anyActive = true;
      }
    }
    return anyActive;
  }
};

// YMind Pro - 润物细无声的 Apple 级仿生连续物理动效引擎
import { bus, EVENTS } from "../core/event-bus.js";
import { drawAppleSquircle } from "../geometry/squircle.js";
import { isDarkCanvasTheme } from "../data/palettes.js";

class NodeAnimator {
  constructor() {
    this.animatingNodes = new Set();
    this.rafId = null;
    this.lastTime = 0;
    this.initialized = false;
    this.inFrame = false;

    // 🌟 核心突破：跨引用持久状态映射表 (Stable Node ID -> Physics State)
    this.nodeStateMap = new Map();
    this.collapsingEntries = [];
  }

  // 🌟 LRU 物理状态防膨胀：超出 1200 个节点时淘汰最老条目，防止长时间运行内存暴毙
  safeSetNodeState(id, stateObj) {
    if (!id) return;
    if (this.nodeStateMap.size > 1200) {
      const oldestKey = this.nodeStateMap.keys().next().value;
      this.nodeStateMap.delete(oldestKey);
    }
    // 物理直接操作内部 Map，绝对禁止自调用
    this.nodeStateMap.set(id, stateObj);
  }

  isAnimating(node) {
    return Boolean(node && this.animatingNodes.has(node));
  }

  // 🌟 手动分支展开：直接将子节点初态绑定在父节点边缘，并彻底清除非法残留的收拢动画条目
  prepareExpand(parentNode) {
    if (!parentNode || !parentNode.children) return;

    const collectSubtreeIds = (n, set = new Set()) => {
      if (!n) return set;
      set.add(n.id);
      if (n.children) n.children.forEach(c => collectSubtreeIds(c, set));
      return set;
    };
    const affectedIds = collectSubtreeIds(parentNode);
    this.collapsingEntries = this.collapsingEntries.filter(e => !affectedIds.has(e.node?.id));

    const pw = parentNode.width || 80;
    const ph = parentNode.height || 36;
    const px = Number.isFinite(parentNode._curX) ? parentNode._curX : (parentNode.x || 0);
    const py = Number.isFinite(parentNode._curY) ? parentNode._curY : (parentNode.y || 0);
    const dir = parentNode.branchDirection || "right";

    const originX = dir === "left" ? px : (dir === "down" ? (px + pw / 2) : (px + pw));
    const originY = dir === "down" ? (py + ph) : (py + ph / 2);

    const stack = [...parentNode.children];
    while (stack.length > 0) {
      const c = stack.pop();
      if (!c) continue;
      this.animatingNodes.delete(c);
      if (c.id) this.nodeStateMap.delete(c.id);

      c._curX = originX - (dir === "left" ? (c.width || 80) : 0);
      c._curY = originY - (c.height || 36) / 2;
      c._vx = 0;
      c._vy = 0;
      c._delay = 0;
      c._curAlpha = 0.0;
      c._isExpanding = true;

      if (c.children && c.children.length > 0 && !c.collapsed) {
        for (let i = 0; i < c.children.length; i++) stack.push(c.children[i]);
      }
    }
  }

  // 🌟 分支收拢动效：捕获正在收起的子分支，平滑吸入父节点折叠按钮中并淡出
  collapseBranch(parentNode) {
    this.collapsingEntries = [];
  }

  /**
   * 核心坐标追踪调度器
   */
  track(node, targetX, targetY, parentNode = null, childIndex = 0, skipAnimation = false) {
    if (!this.initialized || skipAnimation) {
      node._curX = targetX;
      node._curY = targetY;
      node._curAlpha = 1.0;
      delete node._vx;
      delete node._vy;
      if (node.id) {
        this.safeSetNodeState(node.id, { x: targetX, y: targetY, alpha: 1.0, vx: 0, vy: 0, time: Date.now() });
      }
      return;
    }

    const stateRecord = node.id ? this.nodeStateMap.get(node.id) : null;

    if (stateRecord && Number.isFinite(stateRecord.x) && Number.isFinite(stateRecord.y)) {
      node._curX = stateRecord.x;
      node._curY = stateRecord.y;
      node._curAlpha = stateRecord.alpha ?? 1.0;
      node._vx = stateRecord.vx ?? 0;
      node._vy = stateRecord.vy ?? 0;
      node._delay = 0;
    } else if (node._curX === undefined || !Number.isFinite(node._curX) || !Number.isFinite(node._curY)) {
      if (node._isExpanding && parentNode) {
        const px = Number.isFinite(parentNode._curX) ? parentNode._curX : (parentNode.x || targetX);
        const py = Number.isFinite(parentNode._curY) ? parentNode._curY : (parentNode.y || targetY);
        const pw = parentNode.width || 80;
        const ph = parentNode.height || 36;
        const dir = node.branchDirection || "right";

        node._curX = dir === "left" ? px : (dir === "down" ? (px + pw / 2) : (px + pw));
        node._curY = dir === "down" ? (py + ph) : (py + ph / 2 - (node.height || 36) / 2);
        node._curAlpha = 0.0;
        node._delay = Math.min(48, (childIndex || 0) * 12);
        delete node._isExpanding;
      } else {
        const dir = node.branchDirection || "right";
        const offsetSign = dir === "left" ? 8 : (dir === "down" ? 0 : -8);
        node._curX = targetX + offsetSign;
        node._curY = dir === "down" ? (targetY - 6) : targetY;
        node._curAlpha = 0.35;
        node._delay = 0;
      }
    }

    node._targetX = targetX;
    node._targetY = targetY;
    node._vx = Number.isFinite(node._vx) ? node._vx : 0;
    node._vy = Number.isFinite(node._vy) ? node._vy : 0;

    const toDx = targetX - node._curX;
    const toDy = targetY - node._curY;
    if (node._vx * toDx < 0) node._vx = 0;
    if (node._vy * toDy < 0) node._vy = 0;

    const dist = Math.hypot(toDx, toDy);
    if (dist > 0.4 || (node._curAlpha !== undefined && node._curAlpha < 0.99) || (node._delay && node._delay > 0)) {
      this.animatingNodes.add(node);
      this.startLoop();
    } else {
      node._curX = targetX;
      node._curY = targetY;
      node._curAlpha = 1.0;
      node._vx = 0;
      node._vy = 0;
      this.animatingNodes.delete(node);
      if (node.id) {
        this.safeSetNodeState(node.id, { x: targetX, y: targetY, alpha: 1.0, vx: 0, vy: 0, time: Date.now() });
      }
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
  }

  // 🌟 高性能合批与 LOD 降级绘制（防卡顿与残影）
  drawCollapsingNodes(ctx, docCtx, scale) {
    return;
  }

  startLoop() {
    if (this.rafId) return;
    this.lastTime = performance.now();

    const step = (now) => {
      this.inFrame = true;
      const dt = Math.min(0.032, (now - this.lastTime) / 1000);
            this.lastTime = now;
      let stillActive = false;

      const tension = 240;
      const friction = 31;

      for (const node of this.animatingNodes) {
        if (!Number.isFinite(node._curX) || !Number.isFinite(node._curY) ||
            !Number.isFinite(node._targetX) || !Number.isFinite(node._targetY)) {
          node._curX = Number.isFinite(node._targetX) ? node._targetX : (node.x || 0);
          node._curY = Number.isFinite(node._targetY) ? node._targetY : (node.y || 0);
          node._curAlpha = 1.0;
          node._vx = 0;
          node._vy = 0;
          if (node.id) this.safeSetNodeState(node.id, { x: node._curX, y: node._curY, alpha: 1.0, vx: 0, vy: 0, time: Date.now() });
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
          node._curAlpha = Math.min(1.0, node._curAlpha + dt * 6.5);
        }

        if (node.id) {
          this.safeSetNodeState(node.id, { x: node._curX, y: node._curY, alpha: node._curAlpha, vx: node._vx, vy: node._vy, time: Date.now() });
        }

        const isSettledX = Math.abs(node._curX - node._targetX) < 0.45 && Math.abs(node._vx) < 0.4;
        const isSettledY = Math.abs(node._curY - node._targetY) < 0.45 && Math.abs(node._vy) < 0.4;
        const isSettledAlpha = node._curAlpha >= 0.985;

        if (isSettledX && isSettledY && isSettledAlpha) {
          node._curX = node._targetX;
          node._curY = node._targetY;
          node._curAlpha = 1.0;
          node._vx = 0;
          node._vy = 0;
          this.animatingNodes.delete(node);
          if (node.id) {
            this.safeSetNodeState(node.id, { x: node._targetX, y: node._targetY, alpha: 1.0, vx: 0, vy: 0, time: Date.now() });
          }
        } else {
          stillActive = true;
        }
      }

      this.inFrame = false;
      bus.emit(EVENTS.RENDER_CANVAS_ONLY);

      if (this.collapsingEntries && this.collapsingEntries.length > 0) {
        const remainingCollapsing = [];
        for (let i = 0; i < this.collapsingEntries.length; i++) {
          const item = this.collapsingEntries[i];
          const elapsed = now - item.startTime;
          const p = Math.min(1.0, elapsed / item.duration);
          const ease = p * p * (3 - 2 * p);
          item.curX = item.startX + (item.targetX - item.startX) * ease;
          item.curY = item.startY + (item.targetY - item.startY) * ease;
          item.alpha = Math.max(0, 1.0 - p);

          if (p < 1.0) {
            remainingCollapsing.push(item);
            stillActive = true;
          }
        }
        this.collapsingEntries = remainingCollapsing;
      }

      if (this.animatingNodes.size > 0 || (this.collapsingEntries && this.collapsingEntries.length > 0)) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
        // 🌟 终局清障：动画完全停止后，强制补发一帧纯净重绘，彻底擦除残影
        bus.emit(EVENTS.RENDER_CANVAS_ONLY);
      }
    };

    this.rafId = requestAnimationFrame(step);
  }
}

export const nodeAnimator = new NodeAnimator();
