/**
 * 🛡️ IndexedDB 高性能大容量异步存储引擎 (v2)
 * 支持百兆级快照库 (snapshots) 与完整草稿库 (drafts)
 */
const DB_NAME = "YMIND_PRO_STORAGE_DB";
const DB_VERSION = 2; // 升级版本号以创建 drafts 库
const STORE_SNAPSHOTS = "snapshots";
const STORE_DRAFTS = "drafts";

function openDB() {
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
    req.onsuccess = () => resolve(req.result);
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
