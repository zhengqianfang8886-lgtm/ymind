import { scheduleSessionSave } from "../storage/session.js";
import { state, getActiveTab } from "./store.js";
import { findNode, findParent, sanitizeTreeForHistory, rebuildTopologyIndex, countNodes } from "./tree-utils.js";
import { showToast } from "../ui/dialog.js";
import { locateFocusedNode } from "./camera.js";
import { bus, EVENTS } from "./event-bus.js";
import { logger } from "./logger.js";

export { sanitizeTreeForHistory };

export const COMMANDS = {
  SET_TEXT: "SET_TEXT",
  INSERT_NODE: "INSERT_NODE",
  REMOVE_NODE: "REMOVE_NODE",
  MOVE_NODE: "MOVE_NODE",
  UPDATE_ATTRS: "UPDATE_ATTRS",
  UPDATE_CONFIG: "UPDATE_CONFIG",
  COMPOUND: "COMPOUND"
};

export const MAX_HISTORY_DEPTH = 60;

function deepCloneTree(node) {
  if (!node || typeof node !== "object") return null;
  return sanitizeTreeForHistory(node);
}

function extractValidTree(entry) {
  if (!entry || typeof entry !== "object") return null;
  const candidate = entry.tree || entry.payload || entry.snapshot || (entry.id && entry.text ? entry : null);
  if (candidate && typeof candidate === "object" && candidate.id) {
    return candidate;
  }
  return null;
}

/**
 * 🌟 核心状态记录引擎
 */
export function startFocusSession(tab, rootId) {
  if (!tab || !tab.mindData || !rootId) return;
  const mainRootId = tab.mindData.id || "root";
  if (rootId === mainRootId) {
    commitFocusSession(tab);
    return;
  }
  if (tab._focusSession && tab._focusSession.rootId === rootId) {
    return;
  }
  if (tab._focusSession) {
    commitFocusSession(tab);
  }
  tab._focusSession = {
    rootId: rootId,
    stack: [{
      tree: deepCloneTree(tab.mindData),
      selectedIds: Array.from(tab.selectedIds || [rootId]),
      targetNodeId: rootId,
      actionLabel: "进入专注",
      focusedRootId: rootId,
      timestamp: Date.now()
    }],
    index: 0
  };
  logger.info("FocusSandbox", `Spawned sandbox for [${rootId}] with pristine baseline`);
}
export const initFocusSession = startFocusSession;

export function commitGlobalHistoryState(tab, actionLabel = "修改导图", targetNodeId = null, forceNew = false) {
  if (!tab || !tab.mindData) return;
  if (!tab.historyStack) {
    tab.historyStack = [];
    tab.historyIndex = -1;
  }
  if (tab.historyIndex < tab.historyStack.length - 1) {
    tab.historyStack.splice(tab.historyIndex + 1);
  }

  const snapshot = deepCloneTree(tab.mindData);
  const selectedArr = Array.from(tab.selectedIds || []);
  const now = Date.now();
  const currentRootId = tab.mindData.id || "root";

  const entry = {
    tree: snapshot,
    selectedIds: selectedArr,
    targetNodeId: targetNodeId || (selectedArr.length > 0 ? selectedArr[0] : currentRootId),
    actionLabel: actionLabel,
    focusedRootId: currentRootId,
    timestamp: now
  };

  if (!forceNew && tab.historyIndex >= 0) {
    const prev = tab.historyStack[tab.historyIndex];
    if (prev && prev.targetNodeId === entry.targetNodeId && prev.actionLabel === entry.actionLabel && (now - prev.timestamp < 1500)) {
      tab.historyStack[tab.historyIndex] = entry;
      tab.isDirty = true;
      scheduleSessionSave();
      return;
    }
  }

  tab.historyStack.push(entry);
  if (tab.historyStack.length > MAX_HISTORY_DEPTH) {
    tab.historyStack.shift();
  } else {
    tab.historyIndex++;
  }
  tab.isDirty = true;
  scheduleSessionSave();
}

export function commitHistoryState(tab, actionLabel = "修改导图", targetNodeId = null, forceNew = false) {
  if (!tab || !tab.mindData) return;

  const currentRootId = tab.focusedRootId || tab.mindData.id || "root";
  const isFocusedMode = Boolean(tab.focusedRootId && tab.focusedRootId !== (tab.mindData.id || "root"));

  const snapshot = deepCloneTree(tab.mindData);
  if (!snapshot || !snapshot.id) {
    logger.error("History", "commitHistoryState FATAL: snapshot invalid", tab.mindData);
    return;
  }

  const selectedArr = Array.from(tab.selectedIds || []);
  const now = Date.now();

  const entry = {
    tree: snapshot,
    selectedIds: selectedArr,
    targetNodeId: targetNodeId || (selectedArr.length > 0 ? selectedArr[0] : currentRootId),
    actionLabel: actionLabel,
    focusedRootId: currentRootId,
    timestamp: now
  };

  // 🌟 A. 专注模式硬核沙箱：完全独立的历史栈
  if (isFocusedMode) {
    if (!tab._focusSession || tab._focusSession.rootId !== tab.focusedRootId) {
      tab._focusSession = {
        rootId: tab.focusedRootId,
        stack: [{
          tree: deepCloneTree(tab.mindData),
          selectedIds: selectedArr,
          targetNodeId: tab.focusedRootId,
          actionLabel: "进入专注",
          focusedRootId: tab.focusedRootId,
          timestamp: now
        }],
        index: 0
      };
      logger.info("FocusSandbox", `Spawned sandbox for [${tab.focusedRootId}]`);
    }

    const session = tab._focusSession;
    if (session.index < session.stack.length - 1) {
      session.stack.splice(session.index + 1);
    }

    // 连续打字防抖合并
    if (!forceNew && session.index >= 0) {
      const prev = session.stack[session.index];
      if (prev && prev.targetNodeId === entry.targetNodeId && prev.actionLabel === entry.actionLabel && (now - prev.timestamp < 1500)) {
        session.stack[session.index] = entry;
        tab.isDirty = true;
        scheduleSessionSave();
        return;
      }
    }

    session.stack.push(entry);
    if (session.stack.length > MAX_HISTORY_DEPTH) {
      // 永久保全 stack[0] 进入专注前的纯净初始基准，淘汰最早的中间历史条目
      session.stack.splice(1, 1);
      session.index = session.stack.length - 1;
    } else {
      session.index++;
    }

    logger.info("FocusSandbox", `Push [${actionLabel}], target=${entry.targetNodeId}, idx=${session.index}/${session.stack.length}`);
    tab.isDirty = true;
    scheduleSessionSave();
    return;
  }

  // 🌟 B. 全局主历史栈
  if (!tab.historyStack) {
    tab.historyStack = [];
    tab.historyIndex = -1;
  }

  if (tab.historyIndex < tab.historyStack.length - 1) {
    tab.historyStack.splice(tab.historyIndex + 1);
  }

  if (!forceNew && tab.historyIndex >= 0) {
    const prev = tab.historyStack[tab.historyIndex];
    if (prev && prev.targetNodeId === entry.targetNodeId && prev.actionLabel === entry.actionLabel && (now - prev.timestamp < 1500)) {
      tab.historyStack[tab.historyIndex] = entry;
      tab.isDirty = true;
      scheduleSessionSave();
      return;
    }
  }

  tab.historyStack.push(entry);
  if (tab.historyStack.length > MAX_HISTORY_DEPTH) {
    tab.historyStack.shift();
  } else {
    tab.historyIndex++;
  }

  logger.info("GlobalHistory", `Push [${actionLabel}], target=${entry.targetNodeId}, totalNodes=${countNodes(tab.mindData)}, idx=${tab.historyIndex}/${tab.historyStack.length}`);
  tab.isDirty = true;
  scheduleSessionSave();
}

/**
 * 🌟 退出专注模式时的 Squash 合并
 */
export function commitFocusSession(tab) {
  if (!tab || !tab._focusSession) return;
  const session = tab._focusSession;
  tab._focusSession = null;

  // 仅在专注分支存在未撤销的实质修改 (index > 0) 时提交，若全撤销回初始状态则丢弃沙箱，不产生幽灵全局历史
  if (session.stack && session.index > 0) {
    const branchName = findNode(session.rootId, tab.mindData)?.text || "分支";
    logger.info("FocusSandbox", `Squash committed [${branchName}] changes into global history`);
    commitGlobalHistoryState(tab, `编辑分支「${branchName}」`, session.rootId, true);
  }
}

export function saveSnapshot(targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.mindData) return;
  commitHistoryState(tab, "更新状态", null, true);
}

export function clearTabHistory(tab = null) {
  const t = tab || getActiveTab();
  if (!t || !t.mindData) return;
  const safeTree = deepCloneTree(t.mindData);
  t.historyStack = [{
    tree: safeTree,
    selectedIds: Array.from(t.selectedIds || []),
    targetNodeId: t.focusedRootId || "root",
    actionLabel: "初始状态",
    focusedRootId: t.focusedRootId || "root",
    timestamp: Date.now()
  }];
  t.historyIndex = 0;
  t._focusSession = null;
  delete t.history;
  logger.info("History", `Reset history baseline for tab [${t.title}], nodes=${countNodes(safeTree)}`);
}

/**
 * 🌟 严格边界感知的撤销
 */
export function undo(renderCallback, targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.mindData) return;

  const isFocusedMode = Boolean(tab.focusedRootId && tab.focusedRootId !== (tab.mindData?.id || "root"));
  logger.info("Undo", `Request undo. isFocused=${isFocusedMode}, focusedRootId=${tab.focusedRootId}`);

  // 🌟 A. 专注模式下：绝对严禁穿透回退外部节点！
  if (isFocusedMode) {
    const session = tab._focusSession;
    if (!session || session.index <= 0) {
      logger.warn("Undo", "Blocked at focus sandbox boundary (index <= 0)");
      showToast("⚠️ 已到达当前分支最早记录");
      return;
    }

    session.index--;
    const targetEntry = session.stack[session.index];
    const undoneLabel = session.stack[session.index + 1]?.actionLabel || "操作";
    applyRestoredHistoryEntry(tab, targetEntry, `↩️ 撤销: ${undoneLabel}`);
    if (typeof renderCallback === "function") renderCallback(); else bus.emit(EVENTS.RENDER_APP);
    return;
  }

  // 🌟 B. 全局时间线撤销
  if (!tab.historyStack || tab.historyIndex <= 0) {
    logger.warn("Undo", "Blocked at global history boundary (index <= 0)");
    showToast("ℹ️ 已到达文档最初状态");
    return;
  }

  const undoneActionLabel = tab.historyStack[tab.historyIndex]?.actionLabel || "操作";
  tab.historyIndex--;
  const targetEntry = tab.historyStack[tab.historyIndex];
  applyRestoredHistoryEntry(tab, targetEntry, `↩️ 撤销: ${undoneActionLabel}`);

  if (typeof renderCallback === "function") renderCallback(); else bus.emit(EVENTS.RENDER_APP);
}

export function redo(renderCallback, targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.mindData) return;

  const isFocusedMode = Boolean(tab.focusedRootId && tab.focusedRootId !== (tab.mindData?.id || "root"));
  logger.info("Redo", `Request redo. isFocused=${isFocusedMode}, focusedRootId=${tab.focusedRootId}`);

  if (isFocusedMode && tab._focusSession) {
    const session = tab._focusSession;
    if (session.index >= session.stack.length - 1) {
      showToast("ℹ️ 已是当前专注分支的最新状态");
      return;
    }
    session.index++;
    const targetEntry = session.stack[session.index];
    applyRestoredHistoryEntry(tab, targetEntry, `↪️ 重做: ${targetEntry.actionLabel || '操作'}`);
    if (typeof renderCallback === "function") renderCallback(); else bus.emit(EVENTS.RENDER_APP);
    return;
  }

  if (!tab.historyStack || tab.historyIndex >= tab.historyStack.length - 1) {
    showToast("ℹ️ 已是最新状态");
    return;
  }

  tab.historyIndex++;
  const targetEntry = tab.historyStack[tab.historyIndex];
  applyRestoredHistoryEntry(tab, targetEntry, `↪️ 重做: ${targetEntry.actionLabel || '操作'}`);

  if (typeof renderCallback === "function") renderCallback(); else bus.emit(EVENTS.RENDER_APP);
}

function applyRestoredHistoryEntry(tab, entry, hudMessage) {
  if (!entry) {
    logger.error("HistoryRestore", "Target entry is null, aborting to protect tree");
    return;
  }

  const restoredTree = extractValidTree(entry);
  if (!restoredTree || !restoredTree.id) {
    logger.error("HistoryRestore", "Invalid tree structure in history entry!", entry);
    showToast("⚠️ 历史快照数据异常，已保护现有节点不受损");
    return;
  }

  tab.mindData = deepCloneTree(restoredTree);
  rebuildTopologyIndex(tab.mindData);

  // 严格保持当前视口根节点有效性
  if (tab.focusedRootId && findNode(tab.focusedRootId, tab.mindData)) {
    // 保持当前专注
  } else {
    tab.focusedRootId = tab.mindData.id || "root";
  }

  const validIds = (entry.selectedIds || []).filter(id => Boolean(findNode(id, tab.mindData)));
  tab.selectedIds = new Set(validIds.length > 0 ? validIds : [entry.targetNodeId || tab.focusedRootId]);

  tab.isDirty = true;
  tab.isLayoutDirty = true;
  state.isLayoutDirty = true;
  if (tab.spatialIndex) {
    tab.spatialIndex.clear();
  }
  if (tab._context) {
    tab._context.markLayoutDirty(null);
  }
  scheduleSessionSave();

  logger.info("HistoryRestore", `Restored: nodes=${countNodes(tab.mindData)}, selected=[${Array.from(tab.selectedIds).join(",")}], root=${tab.focusedRootId}`);

  if (entry.targetNodeId) {
    const targetNode = findNode(entry.targetNodeId, tab.mindData);
    if (targetNode) {
      // 撤销时仅在节点滑出视口时做轻柔推入 (keyboard 边缘吸附)，绝不全屏暴力居中，保持心流连续
      locateFocusedNode(targetNode, true, tab._context, "keyboard");
    }
  }

  showToast(hudMessage);
}

export function abortDraftNodeCreation(tab, nodeId) {
  if (!tab || !tab.mindData || !nodeId) return;
  const parent = findParent(nodeId, tab.mindData);
  if (parent && parent.children) {
    parent.children = parent.children.filter(c => c.id !== nodeId);
    tab.selectedIds = new Set([parent.id]);
    tab.isLayoutDirty = true;
    rebuildTopologyIndex(tab.mindData);
    logger.info("DraftAbort", `Draft node [${nodeId}] removed cleanly`);
  }
}

export function executeCommand(cmd, applyImmediately = true, targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.mindData) return;

  const currentRootId = tab.focusedRootId || tab.mindData.id || "root";
  const isFocusedMode = Boolean(tab.focusedRootId && tab.focusedRootId !== (tab.mindData.id || "root"));
  if (isFocusedMode && (!tab._focusSession || tab._focusSession.rootId !== currentRootId)) {
    startFocusSession(tab, currentRootId);
  }

  let label = "编辑节点";
  let targetId = cmd?.nodeId || null;

  if (applyImmediately) {
    applyLegacyCmd(cmd, tab.mindData, tab);
    rebuildTopologyIndex(tab.mindData);
  }

  switch (cmd.type) {
    case COMMANDS.SET_TEXT: label = "修改文字"; break;
    case COMMANDS.INSERT_NODE: {
      const txt = String(cmd.node?.text || '主题').trim();
      const snippet = txt.length > 10 ? txt.slice(0, 10) + '…' : txt;
      label = `添加分支「${snippet}」`;
      targetId = cmd.node?.id;
      break;
    }
    case COMMANDS.REMOVE_NODE: {
      const txt = String(cmd.oldNode?.text || '主题').trim();
      const snippet = txt.length > 10 ? txt.slice(0, 10) + '…' : txt;
      label = `删除节点「${snippet}」`;
      targetId = cmd.oldParentId;
      break;
    }
    case COMMANDS.MOVE_NODE: label = "移动分支位置"; break;
    case COMMANDS.UPDATE_ATTRS: label = "修改属性样式"; break;
    case COMMANDS.UPDATE_CONFIG: label = "修改全局样式"; break;
    case COMMANDS.COMPOUND: label = "批量操作"; break;
  }

  tab.isDirty = true;
  tab.isLayoutDirty = true;
  commitHistoryState(tab, label, targetId, cmd.type !== COMMANDS.SET_TEXT);
}

export function executeCompoundCommand(commands, applyImmediately = true, targetTab = null) {
  if (!Array.isArray(commands) || commands.length === 0) return;
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.mindData) return;

  const currentRootId = tab.focusedRootId || tab.mindData.id || "root";
  const isFocusedMode = Boolean(tab.focusedRootId && tab.focusedRootId !== (tab.mindData.id || "root"));
  if (isFocusedMode && (!tab._focusSession || tab._focusSession.rootId !== currentRootId)) {
    startFocusSession(tab, currentRootId);
  }

  if (applyImmediately) {
    commands.forEach(cmd => applyLegacyCmd(cmd, tab.mindData, tab));
    rebuildTopologyIndex(tab.mindData);
  }

  tab.isDirty = true;
  tab.isLayoutDirty = true;
  commitHistoryState(tab, "批量操作", commands[0]?.nodeId || null, true);
}

function applyLegacyCmd(cmd, root, tab) {
  if (!cmd || !root) return;
  switch (cmd.type) {
    case COMMANDS.SET_TEXT: {
      const node = findNode(cmd.nodeId, root);
      if (node) node.text = cmd.newText;
      break;
    }
    case COMMANDS.INSERT_NODE: {
      const parent = findNode(cmd.parentId, root);
      if (parent) {
        if (!parent.children) parent.children = [];
        const insIdx = typeof cmd.index === "number" ? Math.min(cmd.index, parent.children.length) : parent.children.length;
        parent.children.splice(insIdx, 0, cmd.node);
      }
      break;
    }
    case COMMANDS.REMOVE_NODE: {
      const parent = (cmd.oldParentId ? findNode(cmd.oldParentId, root) : null) || findParent(cmd.nodeId, root);
      if (parent && parent.children) {
        parent.children = parent.children.filter(c => String(c.id) !== String(cmd.nodeId));
      }
      break;
    }
    case COMMANDS.MOVE_NODE: {
      const oldP = findNode(cmd.fromParentId, root);
      const newP = findNode(cmd.toParentId, root);
      if (oldP && newP && oldP.children) {
        const curIdx = oldP.children.findIndex(c => c.id === cmd.nodeId);
        if (curIdx !== -1) {
          const n = oldP.children.splice(curIdx, 1)[0];
          if (n) {
            if (!newP.children) newP.children = [];
            const toIdx = typeof cmd.toIndex === "number" ? Math.min(cmd.toIndex, newP.children.length) : newP.children.length;
            newP.children.splice(toIdx, 0, n);
          }
        }
      }
      break;
    }
    case COMMANDS.UPDATE_CONFIG: {
      if (tab && cmd.prop) tab[cmd.prop] = cmd.newVal;
      break;
    }
    case COMMANDS.UPDATE_ATTRS: {
      const node = findNode(cmd.nodeId, root);
      if (node && cmd.newAttrs) {
        for (const [k, v] of Object.entries(cmd.newAttrs)) {
          if (v === undefined) delete node[k];
          else node[k] = v;
        }
      }
      break;
    }
    case COMMANDS.COMPOUND: {
      if (Array.isArray(cmd.commands)) {
        cmd.commands.forEach(sub => applyLegacyCmd(sub, root, tab));
      }
      break;
    }
  }
}
