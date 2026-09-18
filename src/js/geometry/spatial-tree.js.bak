export class QuadTree {
  constructor(boundary = { x: -80000, y: -80000, width: 160000, height: 160000 }, capacity = 16, depth = 0, maxDepth = 6) {
    this.boundary = boundary;
    this.capacity = capacity;
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.items = [];
    this.divided = false;
    this.nw = null;
    this.ne = null;
    this.sw = null;
    this.se = null;
  }

  subdivide() {
    const { x, y, width, height } = this.boundary;
    const w = width / 2, h = height / 2;
    const nextDepth = this.depth + 1;
    this.nw = new QuadTree({ x, y, width: w, height: h }, this.capacity, nextDepth, this.maxDepth);
    this.ne = new QuadTree({ x: x + w, y, width: w, height: h }, this.capacity, nextDepth, this.maxDepth);
    this.sw = new QuadTree({ x, y: y + h, width: w, height: h }, this.capacity, nextDepth, this.maxDepth);
    this.se = new QuadTree({ x: x + w, y: y + h, width: w, height: h }, this.capacity, nextDepth, this.maxDepth);
    this.divided = true;

    // 重新分配既有条目：仅能完全纳入单一子象限者下沉，跨轴者保留在当前节点
    const remainingItems = [];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const target = this._getContainingQuadrant(it);
      if (target) {
        target.insert(it);
      } else {
        remainingItems.push(it);
      }
    }
    this.items = remainingItems;
  }

  _getContainingQuadrant(item) {
    const midX = this.boundary.x + this.boundary.width / 2;
    const midY = this.boundary.y + this.boundary.height / 2;
    const itRight = item.x + (item.width || 0);
    const itBottom = item.y + (item.height || 0);

    const inTop = itBottom <= midY;
    const inBottom = item.y >= midY;
    const inLeft = itRight <= midX;
    const inRight = item.x >= midX;

    if (inTop && inLeft) return this.nw;
    if (inTop && inRight) return this.ne;
    if (inBottom && inLeft) return this.sw;
    if (inBottom && inRight) return this.se;
    return null;
  }

  insert(item) {
    if (!this.intersects(this.boundary, item)) return false;

    if (this.divided) {
      const target = this._getContainingQuadrant(item);
      if (target) return target.insert(item);
      this.items.push(item);
      return true;
    }

    this.items.push(item);

    if (this.items.length > this.capacity && this.depth < this.maxDepth) {
      this.subdivide();
    }
    return true;
  }

  queryRange(range, found = new Set()) {
    if (!this.intersects(this.boundary, range)) return found;

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (this.intersects(it, range)) found.add(it.id);
    }

    if (this.divided) {
      if (this.nw.intersects(this.nw.boundary, range)) this.nw.queryRange(range, found);
      if (this.ne.intersects(this.ne.boundary, range)) this.ne.queryRange(range, found);
      if (this.sw.intersects(this.sw.boundary, range)) this.sw.queryRange(range, found);
      if (this.se.intersects(this.se.boundary, range)) this.se.queryRange(range, found);
    }
    return found;
  }

  queryItems(range, found = [], seen = new Set()) {
    if (!this.intersects(this.boundary, range)) return found;

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!seen.has(it.id) && this.intersects(it, range)) {
        seen.add(it.id);
        found.push(it);
      }
    }

    if (this.divided) {
      if (this.nw.intersects(this.nw.boundary, range)) this.nw.queryItems(range, found, seen);
      if (this.ne.intersects(this.ne.boundary, range)) this.ne.queryItems(range, found, seen);
      if (this.sw.intersects(this.sw.boundary, range)) this.sw.queryItems(range, found, seen);
      if (this.se.intersects(this.se.boundary, range)) this.se.queryItems(range, found, seen);
    }
    return found;
  }

  pickNode(wx, wy, pad = 8, isVisibleFn = null) {
    const searchBox = { x: wx - pad, y: wy - pad, width: pad * 2, height: pad * 2 };
    const candidates = this.queryItems(searchBox);
    for (let i = candidates.length - 1; i >= 0; i--) {
      const item = candidates[i];
      if (isVisibleFn && !isVisibleFn(item.id)) continue;
      if (wx >= item.x - pad && wx <= item.x + item.width + pad &&
          wy >= item.y - pad && wy <= item.y + item.height + pad) {
        return item.node || item;
      }
    }
    return null;
  }

  pickCollapseBadge(wx, wy, focusedRootId, isVisibleFn = null, hitRadius = 18) {
    const pad = Math.max(18, hitRadius);
    // 扩大搜索包围盒，确保动画运动过程中的实时坐标均可被检索
    const searchPad = Math.max(80, pad + 50);
    const searchBox = { x: wx - searchPad, y: wy - searchPad, width: searchPad * 2, height: searchPad * 2 };
    const candidates = this.queryItems(searchBox);
    for (let i = 0; i < candidates.length; i++) {
      const n = candidates[i].node;
      if (isVisibleFn && !isVisibleFn(n.id)) continue;
      if (n.children && n.children.length > 0 && n.id !== focusedRootId) {
        // 优先基于肉眼可见的实时动画坐标计算，彻底杜绝快速连击判定脱靶
        const nx = (n._curX !== undefined && Number.isFinite(n._curX)) ? n._curX : n.x;
        const ny = (n._curY !== undefined && Number.isFinite(n._curY)) ? n._curY : n.y;
        const bx = (n.branchDirection === "left") ? nx : (nx + n.width);
        const by = ny + n.height / 2;
        if (Math.hypot(wx - bx, wy - by) <= pad) return n;
      }
    }
    return null;
  }

  intersects(r1, r2) {
    const r1x2 = r1.x + (r1.width || 0);
    const r1y2 = r1.y + (r1.height || 0);
    const r2x2 = r2.x + (r2.width || 0);
    const r2y2 = r2.y + (r2.height || 0);
    return !(r1x2 < r2.x || r1.x > r2x2 || r1y2 < r2.y || r1.y > r2y2);
  }

  
  removeSubtree(node) {
    if (!node) return;
    const stack = [node];
    while (stack.length > 0) {
      const curr = stack.pop();
      this.remove(curr.id);
      curr._prevSpatial = null;
      if (curr.children && Array.isArray(curr.children)) {
        for (let i = 0; i < curr.children.length; i++) {
          stack.push(curr.children[i]);
        }
      }
    }
  }

  remove(id) {
    let removed = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].id === id) {
        this.items.splice(i, 1);
        removed = true;
      }
    }
    if (this.divided) {
      const rNW = this.nw.remove(id);
      const rNE = this.ne.remove(id);
      const rSW = this.sw.remove(id);
      const rSE = this.se.remove(id);
      removed = removed || rNW || rNE || rSW || rSE;
    }
    return removed;
  }

  update(item) {
    this.remove(item.id);
    return this.insert(item);
  }

  clear() {
    this.items = [];
    this.divided = false;
    this.nw = null;
    this.ne = null;
    this.sw = null;
    this.se = null;
  }
}
