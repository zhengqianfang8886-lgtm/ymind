import { saveSessionImmediate, scheduleSessionSave } from "../storage/session.js";
import { TEMPLATES } from "../data/templates.js";
import { QuadTree } from "../geometry/spatial-tree.js";
import { markNodeLayoutDirty } from "../geometry/layout.js";
import { countNodes, findNode, findParent, getAncestors, sanitizeTreeForHistory } from "./tree-utils.js";
import { getGlobalSettings, saveGlobalSettings, getDefaultSettings, applyGlobalTypography } from "./config.js";
import { canvasMachine, CanvasState } from "../interaction/canvas-machine.js";
import { executeCommand, executeCompoundCommand, saveSnapshot, undo, redo, COMMANDS } from "./history.js";

export { countNodes, findNode, findParent, getAncestors, sanitizeTreeForHistory };
export { getGlobalSettings, saveGlobalSettings, getDefaultSettings, applyGlobalTypography };

export const state = {
  tabs: [],
  activeTabId: null,
  isZenMode: false,
  editingNodeId: null,
  clipboardBranch: null
};

/**
 * @returns {import('../../types').DocumentTab | null}
 */
export function getActiveTab() {
  if (!state.tabs || state.tabs.length === 0) return null;
  let tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) {
    tab = state.tabs[0];
    state.activeTabId = tab.id;
  }
  return tab;
}

/**
 * 🌟 核心第一公民：DocumentContext 文档上下文权威载体
 * 彻底终结全局 PROXY_TAB_SCHEMA 隐式篡改，实现强类型属性托管与事务封装
 */
export class DocumentContext {
  /**
   * @param {import('../../types').DocumentTab} tab
   */
  constructor(tab) {
    if (!tab) throw new Error("DocumentContext: tab is required");
    this.tab = tab;
  }

  get id() { return this.tab.id; }
  get tabId() { return this.tab.id; }
  get title() { return this.tab.title || "未命名导图"; }
  set title(val) { this.tab.title = val; }
  get filePath() { return this.tab.filePath || null; }
  set filePath(val) { this.tab.filePath = val; }

  get mindData() { return this.tab.mindData; }
  set mindData(val) {
    this.tab.mindData = val;
    this.markLayoutDirty(null);
    this.tab.isDirty = true;
  }

  get selectedIds() {
    if (!this.tab.selectedIds) {
      this.tab.selectedIds = new Set();
    } else if (!(this.tab.selectedIds instanceof Set)) {
      this.tab.selectedIds = new Set(this.tab.selectedIds);
    }
    return this.tab.selectedIds;
  }
  set selectedIds(val) {
    this.tab.selectedIds = val instanceof Set ? val : new Set(val);
  }

  get primarySelectedNode() {
    if (!this.tab.mindData || !this.selectedIds || this.selectedIds.size === 0) return null;
    const firstId = this.selectedIds.values().next().value;
    return firstId ? findNode(firstId, this.tab.mindData) : null;
  }

  get focusedRootId() {
    return this.tab.focusedRootId || this.tab.mindData?.id || "root";
  }
  set focusedRootId(val) {
    this.tab.focusedRootId = val;
    state.isLayoutDirty = true;
  }

  get currentRoot() {
    return findNode(this.focusedRootId, this.tab.mindData) || this.tab.mindData;
  }

  get layoutStructure() { return this.tab.layoutStructure || "mindmap"; }
  set layoutStructure(val) {
    this.tab.layoutStructure = val;
    state.isLayoutDirty = true;
  }

  get colorPalette() { return this.tab.colorPalette || "apple-classic"; }
  set colorPalette(val) {
    this.tab.colorPalette = val;
    this.tab.isLayoutDirty = true;
    state.isLayoutDirty = true;
  }

  get nodeSpacing() { return this.tab.nodeSpacing || "normal"; }
  set nodeSpacing(val) {
    this.tab.nodeSpacing = val;
    state.isLayoutDirty = true;
  }

  get lineStyle() { return this.tab.lineStyle || "curve"; }
  set lineStyle(val) { this.tab.lineStyle = val; }

  get boxStyle() { return this.tab.boxStyle || "squircle"; }
  set boxStyle(val) { this.tab.boxStyle = val; }

  get canvasBgColor() { return this.tab.canvasBgColor || "studio-white"; }
  set canvasBgColor(val) { this.tab.canvasBgColor = val; }

  get canvasBgPattern() { return this.tab.canvasBgPattern || "dots"; }
  set canvasBgPattern(val) { this.tab.canvasBgPattern = val; }

  get viewMode() { return this.tab.viewMode || "mindmap"; }
  set viewMode(val) { this.tab.viewMode = val; }

  get isDirty() { return Boolean(this.tab.isDirty); }
  set isDirty(val) { this.tab.isDirty = Boolean(val); }

  get isLayoutDirty() { return this.tab.isLayoutDirty !== false; }
  set isLayoutDirty(val) { this.tab.isLayoutDirty = Boolean(val); }

  get isRecallMode() { return Boolean(this.tab.isRecallMode); }
  set isRecallMode(val) { this.tab.isRecallMode = Boolean(val); }

  get camera() { return this.tab.camera; }
  get spatialIndex() { return this.tab.spatialIndex; }
  get historyStack() { return this.tab.historyStack; }
  get historyIndex() { return this.tab.historyIndex; }

  markLayoutDirty(nodeOrId = null) {
    this.tab.isLayoutDirty = true;
    if (this.tab.mindData) {
      markNodeLayoutDirty(nodeOrId, this.tab.mindData);
    }
  }

  selectNode(nodeId, multi = false) {
    if (!multi) {
      this.tab.selectedIds = new Set(nodeId ? [nodeId] : []);
    } else if (nodeId) {
      const next = new Set(this.selectedIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      this.tab.selectedIds = next;
    }
  }

  focusBranch(rootId) {
    this.focusedRootId = rootId || this.mindData?.id || "root";
    this.markLayoutDirty(this.focusedRootId);
  }

  mutate(mutator, isLayoutSensitive = false, dirtyNodeId = null) {
    const res = mutator(this.tab);
    if (isLayoutSensitive) this.markLayoutDirty(dirtyNodeId);
    return res;
  }

  executeCommand(cmd, apply = true) {
    return executeCommand(cmd, apply, this.tab);
  }

  executeCompoundCommand(cmds, apply = true) {
    return executeCompoundCommand(cmds, apply, this.tab);
  }

  saveSnapshot() {
    return saveSnapshot(this.tab);
  }

  undo(cb) {
    return undo(cb, this.tab);
  }

  redo(cb) {
    return redo(cb, this.tab);
  }

  dispose() {
    if (this.tab.spatialIndex) {
      this.tab.spatialIndex.clear();
      this.tab.spatialIndex = null;
    }
    this.tab._context = null;
  }
}

/**
 * 权威获取指定 Tab 的 DocumentContext 实例（带单例缓存）
 * @param {import('../../types').DocumentTab | string | null} [tabOrId]
 * @returns {DocumentContext | null}
 */
export function getDocumentContext(tabOrId = null) {
  let targetTab = null;
  if (typeof tabOrId === "string") {
    targetTab = state.tabs.find(t => t.id === tabOrId);
  } else if (tabOrId && typeof tabOrId === "object") {
    targetTab = tabOrId.tab || tabOrId;
  } else {
    targetTab = getActiveTab();
  }
  if (!targetTab) return null;
  if (!targetTab._context || targetTab._context.tab !== targetTab) {
    targetTab._context = new DocumentContext(targetTab);
  }
  return targetTab._context;
}

export const getActiveDocumentContext = () => getDocumentContext(null);

export function mutateTab(tabId, mutator, isLayoutSensitive = false) {
  const ctx = getDocumentContext(tabId);
  return ctx ? ctx.mutate(mutator, isLayoutSensitive) : null;
}

export function setActiveTabMindData(tree, isLayoutDirty = true) {
  const ctx = getActiveDocumentContext();
  if (ctx) ctx.mindData = tree;
  if (isLayoutDirty) state.isLayoutDirty = true;
}

export function getPrimarySelectedNode(customCtx = null) {
  const ctx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  return ctx ? ctx.primarySelectedNode : null;
}

Object.defineProperty(state, "isInteracting", {
  get() {
    return canvasMachine.isInteracting();
  },
  set(val) {
    if (!val) {
      if (canvasMachine.is(CanvasState.ANIMATING) || canvasMachine.is(CanvasState.PANNING) || canvasMachine.is(CanvasState.ZOOMING)) {
        canvasMachine.reset();
      }
    } else if (canvasMachine.is(CanvasState.IDLE)) {
      canvasMachine.transition(CanvasState.ANIMATING);
    }
  },
  configurable: true,
  enumerable: true
});

/**
 * 🌟 方案 B 专属：智能未命名编号发生器 (类似 VS Code "Untitled-1", "Untitled-2")
 */
export function generateNextUntitledTitle(basePrefix = "未命名") {
  const existingTitles = new Set(state.tabs.map(t => t.title));
  let counter = 1;
  while (existingTitles.has(`${basePrefix} ${counter}`)) {
    counter++;
  }
  return `${basePrefix} ${counter}`;
}

export function loadTemplate(templateId) {
  const tpl = TEMPLATES[templateId] || TEMPLATES["mindmap-blank"];
  let tab = getActiveTab() || createNewTab(templateId);
  tab.title = tpl.name;
  tab.mindData = sanitizeTreeForHistory(tpl.data);
  tab.layoutStructure = tpl.layout || "mindmap";
  tab.colorPalette = getGlobalSettings().palette || "apple-classic";
  tab.lineStyle = getGlobalSettings().lineStyle || "curve";
  tab.boxStyle = getGlobalSettings().boxStyle || "squircle";
  tab.canvasBgColor = getGlobalSettings().canvasBgColor || "studio-white";
  tab.canvasBgPattern = getGlobalSettings().canvasBgPattern || "dots";
  tab.selectedIds = new Set([tab.mindData.id || "root"]);
  tab.focusedRootId = tab.mindData.id || "root";
  tab.historyStack = [{ type: "SNAPSHOT", payload: sanitizeTreeForHistory(tab.mindData) }];
  tab.historyIndex = 0;
  delete tab.history;
  tab.isDirty = true;
  tab.spatialIndex = new QuadTree();
  state.isLayoutDirty = true;
  return tab;
}

export function createNewTab(templateId = "mindmap-blank", customTitle = null) {
  const tpl = TEMPLATES[templateId] || TEMPLATES["mindmap-blank"];
  const isDefaultBlank = templateId === "mindmap-blank";
  
  // 🌟 若为默认空白导图，自动赋予自增名称 "未命名 1", "未命名 2"；若为模板，加序号消重
  let assignedTitle = customTitle;
  if (!assignedTitle) {
    // 🌟 统一规范：所有未落盘新建文档一律进入 "未命名 1", "未命名 2" 自增序列
    assignedTitle = generateNextUntitledTitle("未命名");
  }

  const initialTree = sanitizeTreeForHistory(tpl.data);
  if (isDefaultBlank) {
    initialTree.text = assignedTitle;
  }

  const newTab = {
    id: "tab_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    title: assignedTitle,
    filePath: null, // 明确无物理路径，属于纯会话草稿
    isDirty: true,
    isLayoutDirty: true,
    isRecallMode: false,
    mindData: initialTree,
    selectedIds: new Set([initialTree.id || "root"]),
    focusedRootId: initialTree.id || "root",
    layoutStructure: tpl.layout || "mindmap",
    nodeSpacing: "normal",
    colorPalette: getGlobalSettings().palette || "apple-classic",
    lineStyle: getGlobalSettings().lineStyle || "curve",
    boxStyle: getGlobalSettings().boxStyle || "squircle",
    canvasBgColor: getGlobalSettings().canvasBgColor || "studio-white",
    canvasBgPattern: getGlobalSettings().canvasBgPattern || "dots",
    viewMode: "mindmap",
    camera: {
      x: typeof window !== "undefined" ? window.innerWidth / 3 : 300,
      y: typeof window !== "undefined" ? window.innerHeight / 2 - 40 : 250,
      scale: 1
    },
    historyStack: [{ type: "SNAPSHOT", payload: sanitizeTreeForHistory(initialTree) }],
    historyIndex: 0,
    spatialIndex: new QuadTree(),
    versions: []
  };
  newTab._context = new DocumentContext(newTab);
  state.tabs.push(newTab);
  state.activeTabId = newTab.id;
  saveSessionImmediate();
  return newTab;
}

export function closeTab(tabId) {
  const idx = state.tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return state.tabs.length;
  
  const [closedTab] = state.tabs.splice(idx, 1);
  if (closedTab) {
    if (closedTab._context) {
      closedTab._context.dispose();
      closedTab._context = null;
    } else if (closedTab.spatialIndex) {
      closedTab.spatialIndex.clear();
      closedTab.spatialIndex = null;
    }
    closedTab.mindData = null;
    closedTab.historyStack = [];
    delete closedTab.history;
    closedTab.camera = null;
  }

  if (state.tabs.length === 0) {
    state.activeTabId = null;
    saveSessionImmediate();
    return 0;
  }
  if (state.activeTabId === tabId) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
  }
  saveSessionImmediate();
  return state.tabs.length;
}

/**
 * @param {import('../../types').DocumentTab | null} [tab]
 * @returns {import('../../types').DocumentContext | null}
 */
export function createDocumentContext(tab = null) {
  return getDocumentContext(tab);
}

export { saveSnapshot, undo, redo, COMMANDS, executeCommand, executeCompoundCommand } from "./history.js";
