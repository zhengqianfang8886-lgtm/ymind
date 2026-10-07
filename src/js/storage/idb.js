/**
 * 🛡️ IndexedDB 高性能大容量异步存储引擎 (v2)
 * 支持百兆级快照库 (snapshots) 与完整草稿库 (drafts)
 */
const DB_NAME = "YMIND_PRO_STORAGE_DB";
const DB_VERSION = 2; // 升级版本号以创建 drafts 库
const STORE_SNAPSHOTS = "snapshots";
const STORE_DRAFTS = "drafts";

// 🌟 BUG-06 防御：数据库单例长连接，彻底终结高频自动快照导致的 IDBDatabase 句柄无限泄漏
let cachedDB = null;

function openDB() {
  if (cachedDB) return Promise.resolve(cachedDB);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      cachedDB = req.result;
      cachedDB.onclose = () => { cachedDB = null; };
      cachedDB.onversionchange = () => {
        if (cachedDB) {
          cachedDB.close();
          cachedDB = null;
        }
      };
      resolve(cachedDB);
    };
    req.onerror = () => reject(req.error);
  });
}

// ======================== 快照管理 ========================
export async function idbSaveSnapshot(snapshot) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    const store = tx.objectStore(STORE_SNAPSHOTS);
    store.put(snapshot);

    // 🌟 磁盘配额防护：限制单文档最多保留 30 条快照，全库最多保留 150 条
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      const sameDoc = all.filter(s => s.tabTitle === snapshot.tabTitle);
      if (sameDoc.length > 30) {
        sameDoc.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const toDel = sameDoc.slice(0, sameDoc.length - 30);
        toDel.forEach(s => store.delete(s.id));
      }
      if (all.length > 150) {
        all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const toDelTotal = all.slice(0, all.length - 150);
        toDelTotal.forEach(s => store.delete(s.id));
      }
    };

    return new Promise((res) => {
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch (err) {
    return false;
  }
}

/**
 * 🌟 安全防线：当文档转换为加密保险箱时，物理销毁 IndexedDB 中该文档的全部历史明文快照
 */
export async function idbDeleteSnapshotsByTitle(tabTitle) {
  if (!tabTitle) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    const store = tx.objectStore(STORE_SNAPSHOTS);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.filter(s => s.tabTitle === tabTitle).forEach(s => store.delete(s.id));
    };
  } catch {}
}

export async function idbGetAllSnapshots() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
    const req = tx.objectStore(STORE_SNAPSHOTS).getAll();
    return new Promise((res) => {
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res(list);
      };
      req.onerror = () => res([]);
    });
  } catch {
    return [];
  }
}

export async function idbDeleteSnapshot(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    tx.objectStore(STORE_SNAPSHOTS).delete(id);
  } catch {}
}

export async function idbClearSnapshots() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    tx.objectStore(STORE_SNAPSHOTS).clear();
  } catch {}
}

export async function idbGetLatestSnapshotByTitle(tabTitle) {
  try {
    const all = await idbGetAllSnapshots();
    return all.find(s => s.tabTitle === tabTitle) || null;
  } catch {
    return null;
  }
}

// ======================== 🌟 草稿专用管理 ========================
export async function idbSaveDraft(id, draftData) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_DRAFTS, "readwrite");
    tx.objectStore(STORE_DRAFTS).put({ id, ...draftData, updatedAt: Date.now() });
    return new Promise((res) => {
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch {
    return false;
  }
}

export async function idbGetDraft(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_DRAFTS, "readonly");
    const req = tx.objectStore(STORE_DRAFTS).get(id);
    return new Promise((res) => {
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function idbDeleteDraft(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_DRAFTS, "readwrite");
    tx.objectStore(STORE_DRAFTS).delete(id);
  } catch {}
}


export async function idbDeleteSnapshotsByTarget(tabTitle, filePath = null) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    const store = tx.objectStore(STORE_SNAPSHOTS);
    const cleanTitle = String(tabTitle || "").replace(/^[●\s]+/, "").trim();
    const cleanPath = String(filePath || "").trim();

    return new Promise((resolve) => {
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          const sTitle = String(val?.tabTitle || "").replace(/^[●\s]+/, "").trim();
          const sPath = String(val?.filePath || "").trim();

          const isMatch = (cleanTitle && sTitle === cleanTitle) ||
                          (cleanPath && sPath === cleanPath) ||
                          (cleanTitle && sPath.includes(cleanTitle)) ||
                          (cleanPath && sTitle.includes(cleanPath));

          if (isMatch) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = () => resolve(false);
      tx.oncomplete = () => resolve(true);
    });
  } catch {
    return false;
  }
}

export async function idbPruneOrphanSnapshots(activeTabs = []) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    const store = tx.objectStore(STORE_SNAPSHOTS);

    if (!activeTabs || activeTabs.length === 0) {
      store.clear();
      return new Promise((res) => {
        tx.oncomplete = () => res(true);
      });
    }

    const allowedTitles = new Set(activeTabs.map(t => String(t.title || "").replace(/^[●\s]+/, "").trim()).filter(Boolean));
    const allowedPaths = new Set(activeTabs.map(t => String(t.filePath || "").trim()).filter(Boolean));

    return new Promise((resolve) => {
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          const sTitle = String(val?.tabTitle || "").replace(/^[●\s]+/, "").trim();
          const sPath = String(val?.filePath || "").trim();

          const isAllowed = allowedTitles.has(sTitle) || (sPath && allowedPaths.has(sPath));
          if (!isAllowed) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = () => resolve(false);
      tx.oncomplete = () => resolve(true);
    });
  } catch {
    return false;
  }
}