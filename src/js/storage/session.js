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
    _isLocked: Boolean(item.isEncrypted),
    _skipAnimation: true
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
        mindData: null, // 🔒 物理阻断：严禁在 LocalStorage 存储明文导图数据
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
    const rawJson = JSON.stringify({
      activeTabId: state.activeTabId,
      tabs: lightTabs,
      timestamp: Date.now()
    });
    // 超过 1.2MB 则不写入 localStorage，防止卡死主线程及超出 5MB 限制
    if (rawJson.length < 1200000) {
      localStorage.setItem(HOT_EXIT_KEY + "_SYNC", rawJson);
    }
  } catch (e) {}
}

export async function saveSessionImmediate() {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  try {
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
    let idbRaw = await idbGetDraft(HOT_EXIT_KEY);
    let syncRaw = null;
    const syncStr = localStorage.getItem(HOT_EXIT_KEY + "_SYNC");
    if (syncStr) {
      try { syncRaw = JSON.parse(syncStr); } catch {}
    }

    let raw = null;
    const idbTime = (idbRaw && typeof idbRaw.timestamp === "number") ? idbRaw.timestamp : 0;
    const syncTime = (syncRaw && typeof syncRaw.timestamp === "number") ? syncRaw.timestamp : 0;

    // 🌟 P1-6 防御：按时间戳竞争仲裁，优先采纳更新的同步降级暂存，杜绝旧 IndexedDB 覆盖最新数据
    if (syncTime > idbTime && Array.isArray(syncRaw?.tabs) && syncRaw.tabs.length > 0) {
      raw = syncRaw;
    } else if (Array.isArray(idbRaw?.tabs) && idbRaw.tabs.length > 0) {
      raw = idbRaw;
    } else if (Array.isArray(syncRaw?.tabs) && syncRaw.tabs.length > 0) {
      raw = syncRaw;
    }
    if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0) {
      return false;
    }

    const rawTabs = raw.tabs.map(deserializeTabFromSession).filter(Boolean);
    if (rawTabs.length === 0) return false;

    // 🌟 物理文件存在性校验：剔除磁盘上已被移动或删除的幽灵文档
    const validTabs = [];
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;

    for (const tab of rawTabs) {
      if (!tab.filePath) {
        validTabs.push(tab);
        continue;
      }
      if (invoke) {
        try {
          const content = await invoke("read_file_content", { path: tab.filePath });
          if (typeof content === "string") {
            if (!tab.isDirty && !tab.isEncrypted) {
              try {
                const parsed = JSON.parse(content);
                const { deserializePackage } = await import("../core/serializer.js");
                const res = deserializePackage(parsed, tab.title, tab.filePath);
                if (res && res.loadedMindData) {
                  tab.mindData = res.loadedMindData;
                }
              } catch {}
            }
            validTabs.push(tab);
          }
        } catch {
          // 🌟 守护会话：外接盘掉线、休眠唤醒延迟或网络盘卡顿时，绝不静默抹杀用户的 Tab！
          console.warn("[HotExit] Storage device temporarily offline or inaccessible, retaining tab:", tab.filePath);
          tab._isOffline = true;
          validTabs.push(tab);
        }
      } else {
        validTabs.push(tab);
      }
    }

    if (validTabs.length === 0) {
      await clearSession();
      state.tabs = [];
      state.activeTabId = null;
      return false;
    }

    state.tabs = validTabs;
    state.activeTabId = (raw.activeTabId && validTabs.some(t => t.id === raw.activeTabId))
      ? raw.activeTabId
      : validTabs[0].id;
    state.isLayoutDirty = true;

    // 🌟 启动合规治理：物理清洗老版本残留的所有不合规孤儿快照
    import("./idb.js").then(m => m.idbPruneOrphanSnapshots(validTabs)).catch(() => {});
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
  // 🌟 会话清空时，同步粉碎快照库全部孤儿记录
  import("./idb.js").then(m => m.idbPruneOrphanSnapshots([])).catch(() => {});
}

bus.on(EVENTS.CONFIG_CHANGE, scheduleSessionSave);
