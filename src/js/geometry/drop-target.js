import { findNode, findParent, getActiveDocumentContext } from "../core/state.js";

/**
 * 🌟 纯几何拓扑计算：判定拖拽节点在四叉树中的跨分支挂载改父级 (reparent) 或同级兄弟排序 (reorder)
 * @param {number} worldX 
 * @param {number} worldY 
 * @param {import('../../types').MindNode} dragNode 
 * @param {import('../../types').MindNode[]} [dragNodes] 
 * @param {any} [customCtx] 
 * @returns {{ type: 'reparent' | 'reorder', targetParent?: any, parent?: any, insertIndex?: number, indicator: any } | null}
 */
export function calculateFullTreeDrop(worldX, worldY, dragNode, dragNodes = [], customCtx = null) {
  const docCtx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  if (!dragNode || !docCtx || dragNode.id === docCtx.focusedRootId) return null;
  const curTab = docCtx.tab;
  if (!curTab?.spatialIndex) return null;

  const movingNodes = (dragNodes && dragNodes.length > 0) ? dragNodes : [dragNode];
  const movingIds = new Set(movingNodes.map(n => n.id));

  // 1. 优先判定：是否悬停在某个目标节点本体上方 -> 触发【跨分支挂载为子节点 (Reparent)】
  const hoverNode = curTab.spatialIndex.pickNode(worldX, worldY, 10);

  if (hoverNode && !movingIds.has(hoverNode.id)) {
    // 全量防环校验：目标节点不能是被移动节点集合中任意一个的后代
    const isInvalidTarget = movingNodes.some(dn => Boolean(findNode(hoverNode.id, dn)));
    // 检查是否所有移动节点已经是 hoverNode 的子节点
    const allAlreadyChildren = movingNodes.every(dn => {
      const p = findParent(dn.id, docCtx.mindData);
      return p && p.id === hoverNode.id;
    });

    if (!isInvalidTarget && !allAlreadyChildren) {
      return {
        type: "reparent",
        targetParent: hoverNode,
        indicator: {
          type: "reparent",
          x: hoverNode.x,
          y: hoverNode.y,
          width: hoverNode.width,
          height: hoverNode.height
        }
      };
    }
  }

  // 2. 次级判定：是否处于当前父级下的同级兄弟槽位 -> 触发【同级插入排序】
  const parent = findParent(dragNode.id, docCtx.mindData);
  if (!parent || !parent.children || parent.children.length <= 1) return null;

  const siblings = parent.children;
  const structure = docCtx.layoutStructure || "mindmap";

  if (structure === "org-down") {
    let closest = -1, minD = Infinity;
    for (let i = 0; i <= siblings.length; i++) {
      let slotX;
      if (i === 0) slotX = siblings[0].x - 12;
      else if (i === siblings.length) slotX = siblings[siblings.length - 1].x + siblings[siblings.length - 1].width + 12;
      else slotX = (siblings[i - 1].x + siblings[i - 1].width + siblings[i].x) / 2;

      let d = Math.abs(worldX - slotX);
      if (d < minD && d < 70 && Math.abs(worldY - siblings[0].y) < 140) {
        minD = d;
        closest = i;
      }
    }
    if (closest !== -1) {
      let lineX;
      if (closest === 0) lineX = siblings[0].x - 8;
      else if (closest === siblings.length) lineX = siblings[siblings.length - 1].x + siblings[siblings.length - 1].width + 8;
      else lineX = (siblings[closest - 1].x + siblings[closest - 1].width + siblings[closest].x) / 2;

      return {
        type: "reorder",
        parent,
        insertIndex: closest,
        indicator: { x1: lineX, y1: siblings[0].y - 8, x2: lineX, y2: siblings[0].y + siblings[0].height + 8 }
      };
    }
  } else {
    const sameSide = siblings.filter(s => {
      if (structure === "mindmap" && parent.id === docCtx.focusedRootId) {
        return s.branchDirection === dragNode.branchDirection;
      }
      return true;
    });
    if (sameSide.length > 1) {
      let closest = -1, minD = Infinity;
      for (let i = 0; i <= sameSide.length; i++) {
        let slotY;
        if (i === 0) slotY = sameSide[0].y - 10;
        else if (i === sameSide.length) slotY = sameSide[sameSide.length - 1].y + sameSide[sameSide.length - 1].height + 10;
        else slotY = (sameSide[i - 1].y + sameSide[i - 1].height + sameSide[i].y) / 2;

        let d = Math.abs(worldY - slotY);
        if (d < minD && d < 65 && Math.abs(worldX - sameSide[0].x) < 180) {
          minD = d;
          closest = i;
        }
      }

      if (closest !== -1) {
        let lineY;
        if (closest === 0) lineY = sameSide[0].y - 8;
        else if (closest === sameSide.length) lineY = sameSide[sameSide.length - 1].y + sameSide[sameSide.length - 1].height + 8;
        else lineY = (sameSide[closest - 1].y + sameSide[closest - 1].height + sameSide[closest].y) / 2;

        let minX = sameSide[0].x - 6;
        let maxX = sameSide[0].x + Math.max(...sameSide.map(s => s.width)) + 6;
        let insIdx = (closest === sameSide.length) ? (siblings.indexOf(sameSide[sameSide.length - 1]) + 1) : siblings.indexOf(sameSide[closest]);

        return {
          type: "reorder",
          parent,
          insertIndex: insIdx,
          indicator: { x1: minX, y1: lineY, x2: maxX, y2: lineY }
        };
      }
    }
  }

  return null;
}
