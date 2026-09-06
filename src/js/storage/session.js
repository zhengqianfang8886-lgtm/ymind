import { DocumentContext } from "../core/state.js";
import { state, getActiveTab } from "../core/state.js";
import { QuadTree } from "../geometry/spatial-tree.js";
import { idbSaveDraft, idbGetDraft, idbDeleteDraft } from "./idb.js";
import { bus, EVENTS } from "../core/event-bus.js";
import { sanitizeTreeForHistory } from "../core/tree-utils.js";
import { encryptMindPayload } from "./crypto.js";

const HOT_EXIT_KEY = "WORKSPACE_HOT_EXIT_SESSION_V1";
let sessionSaveTimer = null;

export async function serializeTabForSession(tab) {
  if (!tab) return null;
  const isEncrypted = Boolean(tab.isEncrypted);

  let encryptedVault = tab.encryptedVault || null;
  // 🌟 加密草稿临时数据支持：若处于已解锁编辑态，暂存前将最新修改重新加密封包
  if (isEncrypted && !tab._isLocked && tab.password && tab.mindData) {
    try {
      encryptedVault = await encryptMindPayload(tab.mindData, tab.password, tab.passwordHint || "");
      tab.encryptedVault = encryptedVault;
    } catch (e) {
      console.warn("[Session] Failed to encrypt temporary draft payload:", e);
    }
  }

  // 🛡️ 核心安全铁律：明文树在临时会话中坚决物理阻断，由 encryptedVault 承载密文暂存
  const safeMindData = isEncrypted
    ? { id: "root", text: "🔒 保密导图已锁定", children: [] }
    : tab.mindData;

  const safeHistoryStack = isEncrypted
    ? []
    : (tab.historyStack || []).slice(-30).map(record => {
        if (record && record.type === "SNAPSHOT") {
          return { type: "SNAPSHOT", payload: record.payload };
        }
        return record;
      });

  return {
    id: tab.id,
    title: tab.title || "未命名导图",
    filePath: tab.filePath || null,
    isDirty: Boolean(tab.isDirty),
    isRecallMode: Boolean(tab.isRecallMode),
    mindData: safeMindData,
    selectedIds: isEncrypted ? ["root"] : Array.from(tab.selectedIds || []),
    focusedRootId: isEncrypted ? "root" : (tab.focusedRootId || "root"),
    layoutStructure: tab.layoutStructure || "mindmap",
    nodeSpacing: tab.nodeSpacing || "normal",
    colorPalette: tab.colorPalette || "apple-classic",
    lineStyle: tab.lineStyle || "curve",
    boxStyle: tab.boxStyle || "squircle",
    canvasBgColor: tab.canvasBgColor || "studio-white",
    canvasBgPattern: tab.canvasBgPattern || "dots",
    viewMode: isEncrypted ? "mindmap" : (tab.viewMode || "mindmap"),
    camera: tab.camera ? { ...tab.camera } : {
      x: typeof window !== "undefined" ? window.innerWidth / 3 : 300,
      y: typeof window !== "undefined" ? window.innerHeight / 2 - 40 : 250,
      scale: 1
    },
    historyStack: safeHistoryStack,
    historyIndex: isEncrypted ? -1 : (tab.historyIndex ?? safeHistoryStack.length - 1),
    history: [], // 向后兼容旧测试断言
    versions: isEncrypted ? [] : (tab.versions || []),
    isEncrypted: isEncrypted,
    passwordHint: tab.passwordHint || "",
    encryptedVault: encryptedVault,
    _isLocked: isEncrypted
  };
}

export function deserializeTabFromSession(item) {
  if (!item || !item.id) return null;
  const rootId = item.mindData?.id || "root";
  const cleanMindData = item.mindData || { id: "root", text: item.title || "中心主题", children: [] };

  let restoredStack = [];
  if (Array.isArray(item.historyStack) && item.historyStack.length > 0) {
    restoredStack = item.historyStack;
  } else if (Array.isArray(item.history) && item.history.length > 0) {
    restoredStack = item.history.map(h => ({ type: "SNAPSHOT", payload: sanitizeTreeForHistory(h) }));
  } else if (cleanMindData) {
    restoredStack = [{ type: "SNAPSHOT", payload: sanitizeTreeForHistory(cleanMindData) }];
  }

  const restoredIndex = typeof item.historyIndex === "number" && item.historyIndex >= 0 && item.historyIndex < restoredStack.length
    ? item.historyIndex
    : (restoredStack.length - 1);

  const tabObj = {
    id: item.id,
    title: item.title,
    filePath: item.filePath || null,
    isDirty: Boolean(item.isDirty),
    isLayoutDirty: true,
    isRecallMode: Boolean(item.isRecallMode),
    mindData: cleanMindData,
    selectedIds: new Set(item.selectedIds && item.selectedIds.length ? item.selectedIds : [rootId]),
    focusedRootId: item.focusedRootId || rootId,
    layoutStructure: item.layoutStructure || "mindmap",
    nodeSpacing: item.nodeSpacing || "normal",
    colorPalette: item.colorPalette || "apple-classic",
    lineStyle: item.lineStyle || "curve",
    boxStyle: item.boxStyle || "squircle",
    canvasBgColor: item.canvasBgColor || "studio-white",
    canvasBgPattern: item.canvasBgPattern || "dots",
    viewMode: item.viewMode || "mindmap",
    camera: item.camera || {
      x: typeof window !== "undefined" ? window.innerWidth / 3 : 300,
      y: typeof window !== "undefined" ? window.innerHeight / 2 - 40 : 250,
      scale: 1
    },
    historyStack: restoredStack,
    historyIndex: restoredIndex,
    spatialIndex: new QuadTree(),
    versions: item.versions || [],
    isEncrypted: Boolean(item.isEncrypted),
    passwordHint: item.passwordHint || "",
    encryptedVault: item.encryptedVault || null,
    _isLocked: Boolean(item.isEncrypted)
  };
  tabObj._context = new DocumentContext(tabObj);
  return tabObj;
}

export function saveSessionSyncFallback() {
  try {
    if (!state.tabs || state.tabs.length === 0) {
      localStorage.removeItem(HOT_EXIT_KEY + "_SYNC");
      return;
    }
    const lightTabs = state.tabs.map(tab => {
      if (tab.isEncrypted) {
        return {
          id: tab.id,
          title: tab.title,
          filePath: tab.filePath || null,
          isDirty: Boolean(tab.isDirty),
          isEncrypted: true,
          passwordHint: tab.passwordHint || "",
          encryptedVault: tab.encryptedVault || null,
          _isLocked: true
        };
      }
      return {
        id: tab.id,
        title: tab.title,
        filePath: tab.filePath || null,
        isDirty: Boolean(tab.isDirty),
        mindData: tab.mindData,
        focusedRootId: tab.focusedRootId || "root",
        layoutStructure: tab.layoutStructure || "mindmap",
        colorPalette: tab.colorPalette || "apple-classic",
        lineStyle: tab.lineStyle || "curve",
        boxStyle: tab.boxStyle || "squircle",
        canvasBgColor: tab.canvasBgColor || "studio-white",
        canvasBgPattern: tab.canvasBgPattern || "dots",
        viewMode: tab.viewMode || "mindmap",
        camera: tab.camera,
        isEncrypted: false
      };
    });
    localStorage.setItem(HOT_EXIT_KEY + "_SYNC", JSON.stringify({
      activeTabId: state.activeTabId,
      tabs: lightTabs,
      timestamp: Date.now()
    }));
  } catch (e) {}
}

export async function saveSessionImmediate() {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  try {
    saveSessionSyncFallback();
    if (!state.tabs || state.tabs.length === 0) {
      await idbDeleteDraft(HOT_EXIT_KEY);
      return;
    }
    const serializedTabs = await Promise.all(state.tabs.map(serializeTabForSession));
    const sessionPayload = {
      activeTabId: state.activeTabId,
      tabs: serializedTabs.filter(Boolean),
      timestamp: Date.now()
    };
    await idbSaveDraft(HOT_EXIT_KEY, sessionPayload);
  } catch (err) {
    console.warn("[HotExit] Failed to persist workspace session:", err);
  }
}

export function scheduleSessionSave() {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    saveSessionImmediate();
  }, 260);
}

export async function restoreSession() {
  try {
    let raw = await idbGetDraft(HOT_EXIT_KEY);
    if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0) {
      const syncRaw = localStorage.getItem(HOT_EXIT_KEY + "_SYNC");
      if (syncRaw) {
        try { raw = JSON.parse(syncRaw); } catch {}
      }
    }
    if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0) {
      return false;
    }

    const restoredTabs = raw.tabs.map(deserializeTabFromSession).filter(Boolean);
    if (restoredTabs.length === 0) return false;

    state.tabs = restoredTabs;
    state.activeTabId = (raw.activeTabId && restoredTabs.some(t => t.id === raw.activeTabId))
      ? raw.activeTabId
      : restoredTabs[0].id;
    state.isLayoutDirty = true;
    return true;
  } catch (e) {
    console.warn("[HotExit] Failed to hydrate workspace session:", e);
    return false;
  }
}

export async function clearSession() {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  localStorage.removeItem(HOT_EXIT_KEY + "_SYNC");
  await idbDeleteDraft(HOT_EXIT_KEY);
}

bus.on(EVENTS.CONFIG_CHANGE, scheduleSessionSave);
