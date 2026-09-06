import { state, getActiveDocumentContext, findParent, findNode, getAncestors, sanitizeTreeForHistory } from "../core/state.js";
import { COMMANDS } from "../core/history.js";
import { locateFocusedNode } from "../core/camera.js";
import { startEditNode, ensureLayoutReady } from "../render/render.js";

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
  locateFocusedNode(child.id, true, ctx, "create");
  startEditNode(child, state, () => bus.emit(EVENTS.RENDER_APP), true, ctx);
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
  locateFocusedNode(sib.id, true, ctx, "create");
  startEditNode(sib, state, () => bus.emit(EVENTS.RENDER_APP), true, ctx);
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
    const remainingChildren = (parent.children || []).filter(c => !deletedIds.has(c.id));
    const todoChildren = remainingChildren.filter(c => c.todo);
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
