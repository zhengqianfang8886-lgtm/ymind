import { state, getActiveDocumentContext, findParent, findNode, getAncestors, sanitizeTreeForHistory } from "../core/state.js";
import { showToast } from "../ui/dialog.js";
import { COMMANDS } from "../core/history.js";
import { locateFocusedNode } from "../core/camera.js";
import { handleNodesMigrationTodoProgress, syncMigratedNodeStyles } from "../ui/todo.js";
import { ensureLayoutReady } from "../geometry/layout.js";

function resolveCtx(a, b) {
  if (b && typeof b === "object" && b.tab) return b;
  if (a && typeof a === "object" && a.tab) return a;
  return getActiveDocumentContext();
}
import { bus, EVENTS } from "../core/event-bus.js";

export function markDirtyAndRefresh(customCtx = null) {
  const ctx = (customCtx && typeof customCtx === "object") ? customCtx : getActiveDocumentContext();
  if (ctx) {
    ctx.isDirty = true;
    ctx.saveSnapshot();
    ctx.markLayoutDirty(null);
  }
  bus.emit(EVENTS.RENDER_APP);
}

export function addChildNode(customCtxOrRender = null, maybeCtx = null) {
  const ctx = resolveCtx(customCtxOrRender, maybeCtx);
  if (!ctx || !ctx.mindData) return;

  let p = ctx.primarySelectedNode || ctx.currentRoot;
  if (!p) return;

  const child = {
    id: "node_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
    text: "新分支",
    collapsed: false,
    children: []
  };

  ctx.executeCommand({
    type: COMMANDS.INSERT_NODE,
    parentId: p.id,
    index: p.children ? p.children.length : 0,
    node: child
  });

  p.collapsed = false;
  ctx.selectNode(child.id);
  ctx.markLayoutDirty(p.id);
  ensureLayoutReady(ctx.tab, true);

  bus.emit(EVENTS.RENDER_APP);
  // 🌟 新建节点进入输入前瞬时就位相机，杜绝动画过渡中坐标漂移导致输入框挂错位置
  locateFocusedNode(child.id, false, ctx, "create");
  bus.emit(EVENTS.START_NODE_EDIT, { node: child, isNewNode: true, ctx });
}

export function addSiblingNode(customCtxOrRender = null, maybeCtx = null) {
  const ctx = resolveCtx(customCtxOrRender, maybeCtx);
  if (!ctx || !ctx.mindData) return;

  const p = ctx.primarySelectedNode;
  if (!p || p.id === ctx.focusedRootId) return addChildNode(customCtxOrRender, maybeCtx);

  const parent = findParent(p.id, ctx.mindData);
  if (!parent) return;

  const sib = {
    id: "node_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
    text: "新主题",
    branchDirection: p.branchDirection || (parent.id === ctx.focusedRootId ? "right" : null),
    collapsed: false,
    children: []
  };
  const idx = parent.children.findIndex(c => c.id === p.id);

  ctx.executeCommand({
    type: COMMANDS.INSERT_NODE,
    parentId: parent.id,
    index: idx + 1,
    node: sib
  });

  ctx.selectNode(sib.id);
  ctx.markLayoutDirty(parent.id);
  ensureLayoutReady(ctx.tab, true);

  bus.emit(EVENTS.RENDER_APP);
  // 🌟 新建节点进入输入前瞬时就位相机，杜绝动画过渡中坐标漂移导致输入框挂错位置
  locateFocusedNode(sib.id, false, ctx, "create");
  bus.emit(EVENTS.START_NODE_EDIT, { node: sib, isNewNode: true, ctx });
}

export function deleteSelectedNodes(customCtxOrRender = null, maybeCtx = null) {
  const ctx = resolveCtx(customCtxOrRender, maybeCtx);
  if (!ctx || !ctx.mindData || ctx.selectedIds.size === 0) return;

  // 🌟 前置剪枝：若某个节点的任何祖先也在选中集合中，则该节点随祖先一同移除，绝不重复生成冗余子命令
  const validSelectedIds = new Set();
  ctx.selectedIds.forEach(id => {
    if (id === ctx.focusedRootId) return;
    const ancestors = getAncestors(id, ctx.mindData);
    const hasSelectedAncestor = ancestors && ancestors.some(a => a.id !== id && ctx.selectedIds.has(a.id));
    if (!hasSelectedAncestor) {
      validSelectedIds.add(id);
    }
  });

  if (validSelectedIds.size === 0) return;

  // 收集待删除项并按在父级中的索引降序排序，杜绝同级删除与撤销时的位移踩踏
  const itemsToDelete = [];
  validSelectedIds.forEach(id => {
    const parent = findParent(id, ctx.mindData);
    if (parent && parent.children) {
      const idx = parent.children.findIndex(c => c.id === id);
      if (idx !== -1) {
        itemsToDelete.push({ id, parent, idx, node: parent.children[idx] });
      }
    }
  });

  itemsToDelete.sort((a, b) => b.idx - a.idx);

  let fallbackId = ctx.focusedRootId;
  const subCommands = [];
  const affectedParents = new Map();

  itemsToDelete.forEach(({ id, parent, idx, node }) => {
    subCommands.push({
      type: COMMANDS.REMOVE_NODE,
      nodeId: id,
      oldParentId: parent.id,
      oldIndex: idx,
      oldNode: sanitizeTreeForHistory(node)
    });
    fallbackId = parent.id;

    if (!affectedParents.has(parent.id)) {
      affectedParents.set(parent.id, { parent, deletedIds: new Set() });
    }
    affectedParents.get(parent.id).deletedIds.add(id);
  });

  // 🌟 核心识别：子节点被删除时重新清算父级待办完成度
  affectedParents.forEach(({ parent, deletedIds }) => {
    const hadTodoDeleted = (parent.children || []).some(c => deletedIds.has(c.id) && c.todo);
    const remainingChildren = (parent.children || []).filter(c => !deletedIds.has(c.id));
    const todoChildren = remainingChildren.filter(c => c.todo);
    // 🌟 P1-7 防御：仅在确实有待办子项变动时更新父级进度，严禁将用户手动设置的进度置空
    if (hadTodoDeleted || todoChildren.length > 0) {
      let newPrg = null;
      if (todoChildren.length > 0) {
        const doneCount = todoChildren.filter(c => c.done).length;
        const pct = Math.round((doneCount / todoChildren.length) * 100);
        newPrg = `${pct}%`;
      }
      if (parent.progress !== newPrg) {
        subCommands.push({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: parent.id,
          oldAttrs: { progress: parent.progress || null },
          newAttrs: { progress: newPrg }
        });
        ctx.markLayoutDirty(parent.id);
      }
    }
  });

  if (subCommands.length === 1) {
    ctx.executeCommand(subCommands[0]);
  } else if (subCommands.length > 1) {
    ctx.executeCompoundCommand(subCommands);
  } else {
    return;
  }

  ctx.selectNode(fallbackId);
  ctx.markLayoutDirty(fallbackId);

  bus.emit(EVENTS.RENDER_APP);
  locateFocusedNode(fallbackId, true, ctx, "keyboard");
}

// 🌟 领域服务：提取当前多选中无祖先从属关系的有效顶层节点集合
export function getEffectiveSelectedNodes(customCtx = null) {
  const ctx = resolveCtx(customCtx, null);
  if (!ctx || !ctx.mindData) return [];
  const selectedIds = ctx.selectedIds;
  if (!selectedIds || selectedIds.size === 0) {
    const p = ctx.primarySelectedNode;
    return (p && p.id !== ctx.focusedRootId) ? [p] : [];
  }
  const validNodes = [];
  selectedIds.forEach(id => {
    if (id === ctx.focusedRootId) return;
    const node = findNode(id, ctx.mindData);
    if (!node) return;
    try {
      const ancestors = getAncestors(id, ctx.mindData);
      const hasSelectedAncestor = ancestors && ancestors.some(a => a.id !== id && selectedIds.has(a.id));
      if (!hasSelectedAncestor) validNodes.push(node);
    } catch {
      validNodes.push(node);
    }
  });
  if (validNodes.length === 0) {
    const p = ctx.primarySelectedNode;
    if (p && p.id !== ctx.focusedRootId) validNodes.push(p);
  }
  return validNodes;
}

// 🌟 领域服务：复制选中分支到剪贴板
export function copySelectedNodes(customCtx = null, explicitNode = null) {
  const ctx = resolveCtx(customCtx, null);
  if (!ctx || !ctx.mindData) return;
  const validNodes = explicitNode ? [explicitNode] : getEffectiveSelectedNodes(ctx);
  if (validNodes.length === 0) return;

  state.clipboardBranches = validNodes.map(sanitizeTreeForHistory);
  state.clipboardBranch = state.clipboardBranches[0];
  const tip = validNodes.length === 1 ? `「${validNodes[0].text || "主题"}」` : `${validNodes.length} 个分支`;
  showToast(`📋 已复制${tip}`);
}

// 🌟 领域服务：剪切选中分支（原子事务 + 进度重算 + 重绘通知）
export function cutSelectedNodes(customCtx = null, explicitNode = null) {
  const ctx = resolveCtx(customCtx, null);
  if (!ctx || !ctx.mindData) return;
  const validNodes = explicitNode ? [explicitNode] : getEffectiveSelectedNodes(ctx);
  if (validNodes.length === 0 || validNodes.some(n => n.id === ctx.focusedRootId)) return;

  state.clipboardBranches = validNodes.map(sanitizeTreeForHistory);
  state.clipboardBranch = state.clipboardBranches[0];

  const itemsToDelete = [];
  validNodes.forEach(node => {
    const parent = findParent(node.id, ctx.mindData);
    if (parent && parent.children) {
      const idx = parent.children.findIndex(c => c.id === node.id);
      if (idx !== -1) itemsToDelete.push({ id: node.id, parent, idx, node });
    }
  });
  itemsToDelete.sort((a, b) => b.idx - a.idx);

  const subCommands = [];
  let fallbackId = ctx.focusedRootId;
  const affectedParents = new Set();

  itemsToDelete.forEach(({ id, parent, idx, node }) => {
    if (typeof nodeAnimator?.animatingNodes?.delete === "function") {
      nodeAnimator.animatingNodes.delete(node);
      delete node._curX;
      delete node._curY;
      delete node._vx;
      delete node._vy;
      delete node._delay;
    }
    subCommands.push({
      type: COMMANDS.REMOVE_NODE,
      nodeId: id,
      oldParentId: parent.id,
      oldIndex: idx,
      oldNode: sanitizeTreeForHistory(node)
    });
    fallbackId = parent.id;
    affectedParents.add(parent);
  });

  affectedParents.forEach(parent => {
    const hadTodoDeleted = itemsToDelete.some(it => it.parent.id === parent.id && it.node?.todo);
    const remainingChildren = (parent.children || []).filter(c => !itemsToDelete.some(it => it.id === c.id));
    const todoChildren = remainingChildren.filter(c => c.todo);
    // 🌟 P1-7 防御：仅在确实有待办子项变动时更新父级进度，严禁将用户手动设置的进度置空
    if (hadTodoDeleted || todoChildren.length > 0) {
      let newPrg = null;
      if (todoChildren.length > 0) {
        const doneCount = todoChildren.filter(c => c.done).length;
        const pct = Math.round((doneCount / todoChildren.length) * 100);
        newPrg = `${pct}%`;
      }
      if (parent.progress !== newPrg) {
        subCommands.push({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: parent.id,
          oldAttrs: { progress: parent.progress || null },
          newAttrs: { progress: newPrg }
        });
        ctx.markLayoutDirty(parent.id);
      }
    }
  });

  if (subCommands.length === 1) ctx.executeCommand(subCommands[0]);
  else if (subCommands.length > 1) ctx.executeCompoundCommand(subCommands);

  ctx.selectNode(fallbackId);
  ctx.markLayoutDirty(fallbackId);
  bus.emit(EVENTS.RENDER_APP);
  const tip = validNodes.length === 1 ? `「${validNodes[0].text || "主题"}」` : `${validNodes.length} 个分支`;
  showToast(`✂️ 已剪切${tip}`);
}

// 🌟 领域服务：从剪贴板粘贴分支到目标父节点下
export function pasteNodes(targetNode = null, customCtx = null) {
  const ctx = resolveCtx(customCtx, null);
  if (!ctx || !ctx.mindData) return;
  const p = targetNode || ctx.primarySelectedNode || findNode(ctx.focusedRootId, ctx.mindData);
  const branches = state.clipboardBranches || (state.clipboardBranch ? [state.clipboardBranch] : null);
  if (!p || !branches || branches.length === 0) return;

  function refreshIds(n) {
    n.id = "node_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    if (n.children) n.children.forEach(refreshIds);
  }

  const subCommands = [];
  const newIds = [];
  const startIdx = p.children ? p.children.length : 0;
  const pastedNodes = [];

  branches.forEach((b, offset) => {
    const cloned = sanitizeTreeForHistory(b);
    refreshIds(cloned);
    syncMigratedNodeStyles(cloned, p, ctx.layoutStructure, ctx.focusedRootId);
    subCommands.push({
      type: COMMANDS.INSERT_NODE,
      parentId: p.id,
      index: startIdx + offset,
      node: cloned
    });
    newIds.push(cloned.id);
    pastedNodes.push(cloned);
  });

  // 联动更新目标父级的待办进度
  const progressCmds = handleNodesMigrationTodoProgress(null, p, pastedNodes);
  subCommands.push(...progressCmds);

  if (subCommands.length === 1) ctx.executeCommand(subCommands[0]);
  else ctx.executeCompoundCommand(subCommands);

  p.collapsed = false;
  ctx.selectedIds = new Set(newIds);
  ctx.markLayoutDirty(p.id);
  bus.emit(EVENTS.RENDER_APP);
  const tip = branches.length === 1 ? `「${branches[0].text || "主题"}」` : `${branches.length} 个分支`;
  showToast(`📥 已粘贴${tip}`);
}

bus.on(EVENTS.NODE_ADD_CHILD, ({ ctx }) => addChildNode(null, ctx));
bus.on(EVENTS.NODE_ADD_SIBLING, ({ ctx }) => addSiblingNode(null, ctx));
