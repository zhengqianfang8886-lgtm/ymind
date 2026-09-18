import { findNode, findParent, getActiveDocumentContext } from "../core/state.js";
import { executeCommand, executeCompoundCommand, COMMANDS } from "../core/history.js";
import { showToast } from "./dialog.js";
import { bus, EVENTS } from "../core/event-bus.js";

/**
 * 校验画布鼠标点击坐标是否命中了节点的待办 Checkbox
 */
/**
 * 🌟 核心算法：自适应计算父节点在子节点发生增/删/改后的最新聚合完成度
 * 若已无任何待办子节点，则返回 null 清空进度环
 */
export function calculateRollupProgress(parent, excludingNodeIds = new Set(), overrideNodeState = null) {
  if (!parent || !parent.children) return null;
  const remainingChildren = parent.children.filter(c => !excludingNodeIds.has(c.id));
  const todoChildren = remainingChildren.filter(c => {
    if (overrideNodeState && c.id === overrideNodeState.id) {
      return overrideNodeState.todo;
    }
    return Boolean(c.todo);
  });

  if (todoChildren.length === 0) return null;

  const doneCount = todoChildren.filter(c => {
    if (overrideNodeState && c.id === overrideNodeState.id) {
      return overrideNodeState.done;
    }
    return Boolean(c.done);
  }).length;

  const pct = Math.round((doneCount / todoChildren.length) * 100);
  return `${pct}%`;
}

export function isClickOnCheckbox(node, clickWorldX, clickWorldY) {
  if (!node || !node.todo) return false;
  const padX = Math.max(4, Math.round((node.width - (node.contentWidth || 0)) / 2));
  let currentOffset = padX;

  const boxX = node.x + currentOffset;
  const centerY = node.y + node.height / 2;
  const hitPad = 4;

  return clickWorldX >= boxX - hitPad && clickWorldX <= boxX + 13 + hitPad &&
         clickWorldY >= centerY - 7 - hitPad && clickWorldY <= centerY + 7 + hitPad;
}

/**
 * 切换待办完成状态，并自动联动删除线与父级进度聚合 (Roll-up)
 */
export function toggleTaskDone(node) {
  const docCtx = getActiveDocumentContext();
  if (!docCtx || !node || !node.todo) return;

  const nextDone = !node.done;
  const subCommands = [];

  // 1. 更新当前节点状态与划线
  subCommands.push({
    type: COMMANDS.UPDATE_ATTRS,
    nodeId: node.id,
    oldAttrs: { done: Boolean(node.done), textDecoration: node.textDecoration || "none" },
    newAttrs: { done: nextDone, textDecoration: nextDone ? "line-through" : "none" }
  });

  // 2. 向上聚合父节点进度 (Roll-up)
  const parent = findParent(node.id, docCtx.mindData);
  if (parent) {
    const newPrg = calculateRollupProgress(parent, new Set(), { id: node.id, todo: true, done: nextDone });
    if (parent.progress !== newPrg) {
      subCommands.push({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: parent.id,
        oldAttrs: { progress: parent.progress || null },
        newAttrs: { progress: newPrg }
      });
      docCtx.markLayoutDirty(parent.id);
    }
  }

  if (subCommands.length === 1) {
    docCtx.executeCommand(subCommands[0], true);
  } else {
    docCtx.executeCompoundCommand(subCommands, true);
  }

  docCtx.markLayoutDirty(node.id);
  bus.emit(EVENTS.RENDER_APP);
  if (nextDone) {
    if (node.duration) {
      showToast(`✅ 任务已达成 · 耗时 ${node.duration}`);
    } else {
      showToast("✅ 任务已达成");
    }
  } else {
    showToast("⚪ 标记为待办中");
  }
}

/**
 * 节点在「普通节点」与「待办任务」之间切换（支持框选与多选批量原子转换）
 */
export function toggleNodeTodo(targetNode = null) {
  const docCtx = getActiveDocumentContext();
  if (!docCtx || !docCtx.mindData) return;

  const targetIds = (docCtx.selectedIds && docCtx.selectedIds.size > 0)
    ? Array.from(docCtx.selectedIds)
    : [targetNode?.id || docCtx.primarySelectedNode?.id].filter(Boolean);

  if (targetIds.length === 0) return;

  const nodes = targetIds.map(id => findNode(id, docCtx.mindData)).filter(Boolean);
  if (nodes.length === 0) return;

  // 状态反转判定：只要选中项中存在普通节点，全部转为待办；若全为待办，则批量恢复为普通节点
  const willBeTodo = nodes.some(n => !n.todo);
  const subCommands = [];

  const affectedParents = new Set();
  nodes.forEach(n => {
    subCommands.push({
      type: COMMANDS.UPDATE_ATTRS,
      nodeId: n.id,
      oldAttrs: { todo: Boolean(n.todo), done: Boolean(n.done), textDecoration: n.textDecoration || "none" },
      newAttrs: { todo: willBeTodo, done: false, textDecoration: "none" }
    });
    docCtx.markLayoutDirty(n.id);

    const p = findParent(n.id, docCtx.mindData);
    if (p) affectedParents.add(p);
  });

  // 🌟 核心识别：子节点取消待办或加入待办时，联动重算父级进度（若无待办则置空）
  affectedParents.forEach(parent => {
    const remainingTodoChildren = (parent.children || []).filter(c => {
      const isTarget = nodes.some(n => n.id === c.id);
      return isTarget ? willBeTodo : Boolean(c.todo);
    });

    let newPrg = null;
    if (remainingTodoChildren.length > 0) {
      const doneCount = remainingTodoChildren.filter(c => {
        const isTarget = nodes.some(n => n.id === c.id);
        return isTarget ? false : Boolean(c.done);
      }).length;
      const pct = Math.round((doneCount / remainingTodoChildren.length) * 100);
      newPrg = `${pct}%`;
    }

    if (parent.progress !== newPrg) {
      subCommands.push({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: parent.id,
        oldAttrs: { progress: parent.progress || null },
        newAttrs: { progress: newPrg }
      });
      docCtx.markLayoutDirty(parent.id);
    }
  });

  if (subCommands.length === 1) {
    docCtx.executeCommand(subCommands[0], true);
  } else if (subCommands.length > 1) {
    docCtx.executeCompoundCommand(subCommands, true);
  }

  bus.emit(EVENTS.RENDER_APP);
  const countStr = nodes.length > 1 ? ` ${nodes.length} 个` : "";
  showToast(willBeTodo ? `☑️ 已将${countStr}节点转换为待办事项` : `📄 已将${countStr}节点恢复为普通节点`);
}

/**
 * 🌟 当节点从旧父级迁移到新父级时，计算并返回关于待办进度变更的子命令列表
 */
export function handleNodesMigrationTodoProgress(oldParent, newParent, movingNodes) {
  if (!oldParent && !newParent) return [];
  const commands = [];
  const movingIds = new Set((movingNodes || []).map(n => n.id));
  const hasMovingTodo = (movingNodes || []).some(n => n.todo);

  // 1. 旧父级待办进度重算与清算
  if (oldParent) {
    const hadTodoMoved = (oldParent.children || []).some(c => movingIds.has(c.id) && c.todo);
    const remainingChildren = (oldParent.children || []).filter(c => !movingIds.has(c.id));
    const remainingTodos = remainingChildren.filter(c => c.todo);
    if (hadTodoMoved || remainingTodos.length > 0) {
      let newOldPrg = null;
      if (remainingTodos.length > 0) {
        const doneCount = remainingTodos.filter(c => c.done).length;
        newOldPrg = `${Math.round((doneCount / remainingTodos.length) * 100)}%`;
      }
      if (oldParent.progress !== newOldPrg) {
        commands.push({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: oldParent.id,
          oldAttrs: { progress: oldParent.progress || null },
          newAttrs: { progress: newOldPrg }
        });
      }
    }
  }

  // 2. 新父级待办进度聚合与点亮
  if (newParent) {
    const existingTodoChildren = (newParent.children || []).filter(c => !movingIds.has(c.id) && c.todo);
    const incomingTodoNodes = (movingNodes || []).filter(n => n.todo);
    const totalTodos = existingTodoChildren.length + incomingTodoNodes.length;
    if (hasMovingTodo || existingTodoChildren.length > 0) {
      let newParentPrg = null;
      if (totalTodos > 0) {
        const doneCount = existingTodoChildren.filter(c => c.done).length + incomingTodoNodes.filter(c => c.done).length;
        newParentPrg = `${Math.round((doneCount / totalTodos) * 100)}%`;
      }
      if (newParent.progress !== newParentPrg) {
        commands.push({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: newParent.id,
          oldAttrs: { progress: newParent.progress || null },
          newAttrs: { progress: newParentPrg }
        });
      }
    }
  }

  return commands;
}

/**
 * 🌟 递归同步被迁移节点及其子分支的生长方向与尺寸缓存签名
 */
export function syncMigratedNodeStyles(node, newParent, layoutStructure = "mindmap", focusedRootId = "root") {
  if (!node) return;
  let targetDir = node.branchDirection;
  if (newParent) {
    if (newParent.id === focusedRootId) {
      if (layoutStructure === "logic-left") targetDir = "left";
      else if (layoutStructure === "org-down") targetDir = "down";
      else if (!targetDir) targetDir = "right";
    } else {
      targetDir = newParent.branchDirection || (layoutStructure === "logic-left" ? "left" : "right");
    }
  }

  function applyStyles(curr, dir) {
    curr.branchDirection = dir;
    delete curr._sizeSignature;
    if (curr.children && Array.isArray(curr.children)) {
      curr.children.forEach(c => applyStyles(c, dir));
    }
  }

  applyStyles(node, targetDir);
}
