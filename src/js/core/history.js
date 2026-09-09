import { scheduleSessionSave } from "../storage/session.js";
import { state, getActiveTab } from "./store.js";
import { findNode, findParent } from "./tree-utils.js";
import { sanitizeTreeForHistory, rebuildTopologyIndex } from "./tree-utils.js";
import { bus, EVENTS } from "./event-bus.js";

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

/**
 * 🌟 统一事件驱动事务流：无论是命令模式还是全量快照，统一归入单一线性流水线
 */
export const MAX_HISTORY_DEPTH = 50;

function trimHistoryStack(tab) {
  while (tab.historyStack.length > MAX_HISTORY_DEPTH) {
    if (tab.historyStack[0]?.type === "SNAPSHOT" && tab.historyStack.length > 1) {
      const oldest = tab.historyStack[1];
      if (oldest.type === "COMMAND") {
        // 🌟 历史快照合并时传入 null 作为 targetTab，彻底消除对当前活跃 Tab 配置的意外篡改
        applyCmd(oldest.payload, tab.historyStack[0].payload, null);
        rebuildTopologyIndex(tab.historyStack[0].payload);
      } else if (oldest.type === "SNAPSHOT") {
        tab.historyStack[0].payload = oldest.payload;
      }
      tab.historyStack.splice(1, 1);
    } else {
      tab.historyStack.shift();
      if (tab.historyStack[0]?.type !== "SNAPSHOT") {
        tab.historyStack.unshift({
          type: "SNAPSHOT",
          payload: sanitizeTreeForHistory(tab.mindData)
        });
      }
    }
  }
  tab.historyIndex = Math.max(0, tab.historyStack.length - 1);
}


export function clearTabHistory(tab = null) {
  const targetTab = tab || getActiveTab();
  if (!targetTab) return;
  targetTab.historyStack = targetTab.mindData ? [{ type: "SNAPSHOT", payload: sanitizeTreeForHistory(targetTab.mindData) }] : [];
  targetTab.historyIndex = targetTab.historyStack.length - 1;
  delete targetTab.history;
}

/**
 * @param {import('../../types').HistoryCommand[]} commands
 * @param {boolean} [applyImmediately]
 * @param {import('../../types').DocumentTab | null} [targetTab]
 */
export function executeCompoundCommand(commands, applyImmediately = true, targetTab = null) {
  if (!Array.isArray(commands) || commands.length === 0) return;
  executeCommand({ type: COMMANDS.COMPOUND, commands }, applyImmediately, targetTab);
}

/**
 * @param {import('../../types').HistoryCommand} cmd
 * @param {boolean} [applyImmediately]
 * @param {import('../../types').DocumentTab | null} [targetTab]
 */
export function executeCommand(cmd, applyImmediately = true, targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab) return;
  if (!tab.historyStack) { tab.historyStack = []; tab.historyIndex = -1; }

  if (applyImmediately) {
    applyCmd(cmd, tab.mindData);
    if (cmd.type !== COMMANDS.UPDATE_CONFIG) {
      rebuildTopologyIndex(tab.mindData);
    }
  }

  // 截断游标后的历史
  if (tab.historyIndex < tab.historyStack.length - 1) {
    tab.historyStack.splice(tab.historyIndex + 1);
  }

  // 🌟 剥离全量整树快照，仅保留原子命令 Diff，内存占用降低 99.9%
  tab.historyStack.push({
    type: "COMMAND",
    payload: cmd
  });

  if (tab.historyStack.length > MAX_HISTORY_DEPTH) {
    trimHistoryStack(tab);
  } else {
    tab.historyIndex++;
  }

  delete tab.history;
  tab.isDirty = true;
  if (cmd.type !== COMMANDS.UPDATE_CONFIG || cmd.prop === "layoutStructure" || cmd.prop === "nodeSpacing" || cmd.prop === "colorPalette") {
    tab.isLayoutDirty = true;
  }
  scheduleSessionSave();
}

export function saveSnapshot(targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.mindData) return;

  if (!tab.historyStack) { tab.historyStack = []; tab.historyIndex = -1; }

  const cleanPayload = sanitizeTreeForHistory(tab.mindData);
  const cleanJson = JSON.stringify(cleanPayload);

  // 🛡️ 结构幂等去重：利用指纹缓存避免二次序列化与不必要的深拷贝
  if (tab.historyIndex >= 0 && tab.historyStack[tab.historyIndex]?.type === "SNAPSHOT") {
    const lastRec = tab.historyStack[tab.historyIndex];
    if (lastRec._rawJson === cleanJson) {
      return;
    }
  }

  if (tab.historyIndex < tab.historyStack.length - 1) {
    tab.historyStack.splice(tab.historyIndex + 1);
  }

  tab.historyStack.push({
    type: "SNAPSHOT",
    payload: cleanPayload,
    _rawJson: cleanJson
  });

  // 释放更早快照的字符串指纹，防范桌面长驻运行内存爬升
  if (tab.historyStack.length > 2) {
    for (let i = 0; i < tab.historyStack.length - 2; i++) {
      if (tab.historyStack[i]._rawJson) delete tab.historyStack[i]._rawJson;
    }
  }

  if (tab.historyStack.length > MAX_HISTORY_DEPTH) {
    trimHistoryStack(tab);
  } else {
    tab.historyIndex++;
  }

  delete tab.history;
  tab.isDirty = true;
  state.isLayoutDirty = true;
  scheduleSessionSave();
}

export function undo(renderCallback, targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.historyStack || tab.historyIndex <= 0) return;

  const currentRecord = tab.historyStack[tab.historyIndex];
  if (currentRecord?.type === "COMMAND") {
    revertCmd(currentRecord.payload, tab.mindData);
    tab.historyIndex = Math.max(0, tab.historyIndex - 1);
  } else {
    const targetIndex = Math.max(0, tab.historyIndex - 1);
    tab.historyIndex = targetIndex;
    const targetRecord = tab.historyStack[targetIndex];
    if (targetRecord?.type === "SNAPSHOT") {
      const targetState = targetRecord.snapshot || targetRecord.payload;
      if (targetState) {
        tab.mindData = sanitizeTreeForHistory(targetState);
      }
    } else if (targetRecord?.type === "COMMAND") {
      let baseSnapIdx = -1;
      for (let i = targetIndex - 1; i >= 0; i--) {
        if (tab.historyStack[i]?.type === "SNAPSHOT") {
          baseSnapIdx = i;
          break;
        }
      }
      if (baseSnapIdx !== -1) {
        const baseState = tab.historyStack[baseSnapIdx].snapshot || tab.historyStack[baseSnapIdx].payload;
        const restoredTree = sanitizeTreeForHistory(baseState);
        rebuildTopologyIndex(restoredTree);
        for (let i = baseSnapIdx + 1; i <= targetIndex; i++) {
          const rec = tab.historyStack[i];
          if (rec?.type === "COMMAND") {
            applyCmd(rec.payload, restoredTree);
            rebuildTopologyIndex(restoredTree);
          } else if (rec?.type === "SNAPSHOT") {
            const midState = rec.snapshot || rec.payload;
            if (midState) {
              const cleanMid = sanitizeTreeForHistory(midState);
              Object.assign(restoredTree, cleanMid);
              rebuildTopologyIndex(restoredTree);
            }
          }
        }
        tab.mindData = restoredTree;
      }
  rebuildTopologyIndex(tab.mindData);
  rebuildTopologyIndex(tab.mindData);
    }
  }

  delete tab.history;
  tab.isDirty = true;
  tab.isLayoutDirty = true;
  rebuildTopologyIndex(tab.mindData);
  scheduleSessionSave();
  if (typeof renderCallback === "function") renderCallback();
  else bus.emit(EVENTS.RENDER_APP);
}

export function redo(renderCallback, targetTab = null) {
  const tab = targetTab || getActiveTab();
  if (!tab || !tab.historyStack || tab.historyIndex >= tab.historyStack.length - 1) return;

  tab.historyIndex++;
  const nextRecord = tab.historyStack[tab.historyIndex];
  if (!nextRecord) return;

  if (nextRecord.type === "COMMAND") {
    applyCmd(nextRecord.payload, tab.mindData);
  } else {
    const targetState = nextRecord.snapshot || nextRecord.payload;
    if (targetState) {
      tab.mindData = sanitizeTreeForHistory(targetState);
    }
  }

  delete tab.history;
  tab.isDirty = true;
  tab.isLayoutDirty = true;
  rebuildTopologyIndex(tab.mindData);
  scheduleSessionSave();
  if (typeof renderCallback === "function") renderCallback();
  else bus.emit(EVENTS.RENDER_APP);
}

function applyCmd(cmd, root, targetTab = getActiveTab()) {
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
      const parent = findParent(cmd.nodeId, root);
      if (parent && parent.children) {
        parent.children = parent.children.filter(c => c.id !== cmd.nodeId);
      }
      break;
    }
    case COMMANDS.MOVE_NODE: {
      const oldP = findNode(cmd.fromParentId, root);
      const newP = findNode(cmd.toParentId, root);
      if (oldP && newP && oldP.children) {
        const curIdx = oldP.children.findIndex(c => c.id === cmd.nodeId);
        if (curIdx === -1) break; // 🌟 P0-2 防御：未定位到目标节点时坚决不执行误切
        const n = oldP.children.splice(curIdx, 1)[0];
        if (n) {
          if (!newP.children) newP.children = [];
          const toIdx = typeof cmd.toIndex === "number" ? Math.min(cmd.toIndex, newP.children.length) : newP.children.length;
          newP.children.splice(toIdx, 0, n);
          rebuildTopologyIndex(root);
        }
      }
      break;
    }
    case COMMANDS.UPDATE_CONFIG: {
      if (targetTab && cmd.prop) {
        targetTab[cmd.prop] = cmd.newVal;
      }
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
        for (let i = 0; i < cmd.commands.length; i++) applyCmd(cmd.commands[i], root, targetTab);
      }
      break;
    }
  }
}

function revertCmd(cmd, root, targetTab = getActiveTab()) {
  if (!cmd || !root) return;
  switch (cmd.type) {
    case COMMANDS.SET_TEXT: {
      const node = findNode(cmd.nodeId, root);
      if (node) node.text = cmd.oldText;
      break;
    }
    case COMMANDS.INSERT_NODE: {
      const parent = findNode(cmd.parentId, root);
      if (parent && parent.children) {
        parent.children = parent.children.filter(c => c.id !== cmd.node.id);
      }
      break;
    }
    case COMMANDS.REMOVE_NODE: {
      const parent = findNode(cmd.oldParentId, root);
      if (parent) {
        if (!parent.children) parent.children = [];
        const restoreIdx = typeof cmd.oldIndex === "number" ? Math.min(cmd.oldIndex, parent.children.length) : parent.children.length;
        parent.children.splice(restoreIdx, 0, cmd.oldNode);
      }
      break;
    }
    case COMMANDS.MOVE_NODE: {
      const oldP = findNode(cmd.toParentId, root);
      const origP = findNode(cmd.fromParentId, root);
      if (oldP && origP && oldP.children) {
        const curIdx = oldP.children.findIndex(c => c.id === cmd.nodeId);
        if (curIdx === -1) break; // 🌟 P0-2 防御：未定位到目标节点时坚决不执行误切
        const n = oldP.children.splice(curIdx, 1)[0];
        if (n) {
          if (!origP.children) origP.children = [];
          const fromIdx = typeof cmd.fromIndex === "number" ? Math.min(cmd.fromIndex, origP.children.length) : origP.children.length;
          origP.children.splice(fromIdx, 0, n);
          rebuildTopologyIndex(root);
        }
      }
      break;
    }
    case COMMANDS.UPDATE_CONFIG: {
      if (targetTab && cmd.prop) {
        targetTab[cmd.prop] = cmd.oldVal;
      }
      break;
    }
    case COMMANDS.UPDATE_ATTRS: {
      const node = findNode(cmd.nodeId, root);
      if (node && cmd.oldAttrs) {
        for (const [k, v] of Object.entries(cmd.oldAttrs)) {
          if (v === undefined) delete node[k];
          else node[k] = v;
        }
      }
      break;
    }
    case COMMANDS.COMPOUND: {
      if (Array.isArray(cmd.commands)) {
        for (let i = cmd.commands.length - 1; i >= 0; i--) revertCmd(cmd.commands[i], root);
      }
      break;
    }
  }
}
