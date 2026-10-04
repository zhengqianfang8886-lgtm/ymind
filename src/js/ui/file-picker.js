import { escapeHtml, showToast } from "./dialog.js";

async function callTauri(cmd, args = {}) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (invoke) return await invoke(cmd, args);
  throw new Error("TAURI_IPC_UNAVAILABLE");
}

let currentDir = "";
let navHistory = [];
let navHistoryIndex = -1;
let cachedPlaces = null;
let sortField = "name"; // "name" | "size" | "date"
let sortAsc = true;
let activeFilter = "all-mind"; // "all-mind" | "ymind" | "all"

const RECENT_DIRS_KEY = "YMIND_FILE_PICKER_RECENT_DIRS";

function getRecentDirs() {
  try {
    const raw = localStorage.getItem(RECENT_DIRS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordRecentDir(dir) {
  if (!dir) return;
  const clean = normalizePath(dir);
  try {
    let list = getRecentDirs().filter(d => d !== clean);
    list.unshift(clean);
    if (list.length > 6) list.pop();
    localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(list));
  } catch {}
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(sec) {
  if (!sec) return "--";
  const d = new Date(sec * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function normalizePath(p) {
  if (!p) return "/";
  let clean = String(p).trim().replace(/\\+/g, "/").replace(/\/+/g, "/");

  const isWindowsDrive = /^[a-zA-Z]:/i.test(clean);
  if (isWindowsDrive) {
    if (clean.length === 2) {
      clean += "/";
    }
    if (clean.length > 3 && clean.endsWith("/")) {
      clean = clean.slice(0, -1);
    }
    return clean;
  }

  if (!clean.startsWith("/")) {
    clean = "/" + clean;
  }
  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

export function joinPath(parentDir, filename) {
  const base = normalizePath(parentDir);
  if (base.endsWith("/")) {
    return base + filename;
  }
  return base + "/" + filename;
}

export function getParentDir(currentPath) {
  const norm = normalizePath(currentPath);
  const isWindowsDrive = /^[a-zA-Z]:/i.test(norm);

  if (isWindowsDrive) {
    if (norm.length <= 3) return norm;
    const parts = norm.split("/").filter(Boolean);
    parts.pop();
    if (parts.length === 1) {
      return parts[0] + "/";
    }
    return parts.join("/");
  }

  if (norm === "/") return "/";
  const parts = norm.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

async function loadPlacesAndDrives() {
  if (cachedPlaces) return cachedPlaces;
  try {
    cachedPlaces = await callTauri("get_system_places");
  } catch (err) {
    console.warn("[FilePicker] Failed to fetch system places from backend:", err);
    cachedPlaces = {
      home: "/home",
      documents: "/home/Documents",
      desktop: "/home/Desktop",
      downloads: "/home/Downloads",
      drives: [
        { name: "系统根 (/) ", path: "/", is_removable: false }
      ]
    };
  }

  if (!cachedPlaces.drives || cachedPlaces.drives.length === 0) {
    cachedPlaces.drives = [{ name: "系统盘", path: "/", is_removable: false }];
  }

  return cachedPlaces;
}

export async function openInAppFilePicker({ mode = "open", defaultName = "未命名导图.ymind", initialDir = "" } = {}) {
  return new Promise(async (resolve) => {
    let modal = document.getElementById("apple-file-picker-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "apple-file-picker-modal";
      modal.className = "apple-modal-overlay hidden";
      document.body.appendChild(modal);
    }

    const sys = await loadPlacesAndDrives();

    if (initialDir) {
      currentDir = normalizePath(initialDir);
    } else if (!currentDir) {
      currentDir = normalizePath(sys.documents || sys.home || sys.drives[0]?.path || "/");
    }

    navHistory = [currentDir];
    navHistoryIndex = 0;
    recordRecentDir(currentDir);

    function formatDriveDisplay(drive) {
      const rawName = drive.name || "本地存储";
      const match = rawName.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        return {
          main: match[1].trim(),
          sub: match[2].trim()
        };
      }
      return { main: rawName, sub: "" };
    }

    const drivesListHtml = sys.drives.map(drive => {
      const { main, sub } = formatDriveDisplay(drive);
      const isRemovable = Boolean(drive.is_removable);
      return `
        <div class="fp-place-item" data-path="${escapeHtml(normalizePath(drive.path))}" title="${escapeHtml(drive.path)}">
          <span class="fp-place-icon-box ${isRemovable ? 'removable' : 'disk'}">
            ${isRemovable ? `
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="3"></rect>
                <circle cx="12" cy="12" r="3"></circle>
                <line x1="12" y1="1" x2="12" y2="4"></line>
              </svg>
            ` : `
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="13" rx="2"></rect>
                <path d="M6 19h12M10 16v3M14 16v3"></path>
              </svg>
            `}
          </span>
          <span class="fp-place-label">
            <span>${escapeHtml(main)}</span>
            ${sub ? `<span class="fp-place-subtext">(${escapeHtml(sub)})</span>` : ""}
          </span>
          ${sub && sub.endsWith(":") ? `<span class="fp-drive-tag">${escapeHtml(sub)}</span>` : ""}
        </div>
      `;
    }).join("");

    modal.innerHTML = `
      <div class="apple-modal-card apple-file-picker-card">
        <div class="fp-header-bar">
          <div class="fp-header-left">
            <div class="fp-header-icon">
              ${mode === "open" ? `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              ` : `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                </svg>
              `}
            </div>
            <div class="fp-header-titles">
              <h3 class="fp-header-title">${mode === "open" ? "打开思维导图文件" : "存储思维导图"}</h3>
              <span class="fp-header-sub">${mode === "open" ? "选取本地 .ymind 或兼容思维导图文件以载入工作区" : "指定导图的目标存储目录与文件名"}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button id="fp-btn-mkdir" class="modal-btn modal-btn-secondary" style="padding:6px 12px;font-size:12px;" title="在当前目录下新建文件夹">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:2px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
              <span>新建文件夹</span>
            </button>
            <button id="fp-close-x" class="inspector-close-btn" style="width:28px;height:28px;">✕</button>
          </div>
        </div>

        <div class="fp-nav-toolbar">
          <div class="fp-nav-group">
            <button id="fp-btn-back" class="fp-tool-btn" title="后退 (Alt+Left)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button id="fp-btn-fwd" class="fp-tool-btn" title="前进 (Alt+Right)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <button id="fp-btn-up" class="fp-tool-btn" title="上一层目录 (Backspace)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
          </div>

          <button id="fp-btn-refresh" class="fp-tool-btn" title="重新读取目录" style="border:1px solid rgba(0,0,0,0.06);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          </button>

          <div id="fp-address-box" class="fp-breadcrumb-trail" title="点击可直接编辑物理路径">
            <div id="fp-breadcrumbs" style="display:flex;align-items:center;gap:2px;"></div>
            <input id="fp-direct-path" class="fp-path-direct-input hidden" placeholder="输入绝对路径按回车直达..." />
          </div>

          <div class="fp-search-box">
            <span class="fp-search-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input id="fp-search" class="fp-search-input" type="text" placeholder="过滤项目..." autocomplete="off" spellcheck="false" />
          </div>
        </div>

        <div class="fp-body">
          <aside class="fp-sidebar">
            <div class="fp-sidebar-group">
              <div class="fp-sidebar-title">驱动器与设备</div>
              ${drivesListHtml}
            </div>

            <div class="fp-sidebar-group">
              <div class="fp-sidebar-title">常用位置</div>
              ${sys.desktop ? `
                <div class="fp-place-item" data-path="${escapeHtml(normalizePath(sys.desktop))}">
                  <span class="fp-place-icon-box">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                  </span>
                  <span class="fp-place-label">桌面</span>
                </div>
              ` : ""}
              ${sys.documents ? `
                <div class="fp-place-item" data-path="${escapeHtml(normalizePath(sys.documents))}">
                  <span class="fp-place-icon-box">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                  </span>
                  <span class="fp-place-label">文稿</span>
                </div>
              ` : ""}
              ${sys.downloads ? `
                <div class="fp-place-item" data-path="${escapeHtml(normalizePath(sys.downloads))}">
                  <span class="fp-place-icon-box">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  </span>
                  <span class="fp-place-label">下载</span>
                </div>
              ` : ""}
              ${sys.home ? `
                <div class="fp-place-item" data-path="${escapeHtml(normalizePath(sys.home))}">
                  <span class="fp-place-icon-box">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                  </span>
                  <span class="fp-place-label">个人目录</span>
                </div>
              ` : ""}
            </div>

            <div class="fp-sidebar-group">
              <div class="fp-sidebar-title">最近访问</div>
              <div id="fp-recent-places-list" style="display:flex;flex-direction:column;gap:2px;"></div>
            </div>
          </aside>

          <main class="fp-content-area">
            <div class="fp-table-header">
              <div class="fp-th-col" data-sort="name" style="flex:1;">
                <span>名称</span><span id="sort-icon-name" style="font-size:10px;opacity:0.7;">▲</span>
              </div>
              <div class="fp-th-col" data-sort="date" style="width:130px;">
                <span>修改时间</span><span id="sort-icon-date" style="font-size:10px;opacity:0.7;"></span>
              </div>
              <div class="fp-th-col" data-sort="size" style="width:75px;justify-content:flex-end;">
                <span>大小</span><span id="sort-icon-size" style="font-size:10px;opacity:0.7;"></span>
              </div>
            </div>
            <div id="fp-list-view" class="fp-file-list" tabindex="0"></div>
          </main>
        </div>

        <div class="fp-footer">
          <div style="flex:1;display:flex;align-items:center;gap:10px;min-width:0;">
            ${mode === "save" ? `
              <span style="font-size:12px;font-weight:600;color:var(--text-secondary);flex-shrink:0;">保存为:</span>
              <input id="fp-filename-input" class="apple-modal-input" style="padding:6px 12px;font-size:12.5px;font-weight:600;max-width:320px;" value="${escapeHtml(defaultName)}" />
            ` : `
              <span style="font-size:11.5px;color:var(--text-tertiary);flex-shrink:0;">文件格式:</span>
              <button class="fp-filter-pill active" data-filter="all-mind">全部思维导图 (*.ymind; *.xmind)</button>
              <button class="fp-filter-pill" data-filter="ymind">仅 YMind 原生 (*.ymind)</button>
              <button class="fp-filter-pill" data-filter="all">所有文件 (*.*)</button>
            `}
          </div>
          <div style="display:flex;gap:10px;flex-shrink:0;">
            <button id="fp-btn-cancel" class="modal-btn modal-btn-secondary">取消</button>
            <button id="fp-btn-confirm" class="modal-btn modal-btn-primary">${mode === "open" ? "打开" : "存储"}</button>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
    let currentEntries = [];
    let selectedEntry = null;

    const listContainer = modal.querySelector("#fp-list-view");
    const breadcrumbBox = modal.querySelector("#fp-breadcrumbs");
    const directPathInput = modal.querySelector("#fp-direct-path");
    const addressBox = modal.querySelector("#fp-address-box");
    const btnBack = modal.querySelector("#fp-btn-back");
    const btnFwd = modal.querySelector("#fp-btn-fwd");
    const btnUp = modal.querySelector("#fp-btn-up");
    const btnRefresh = modal.querySelector("#fp-btn-refresh");
    const btnMkdir = modal.querySelector("#fp-btn-mkdir");
    const searchInput = modal.querySelector("#fp-search");
    const filenameInput = modal.querySelector("#fp-filename-input");
    const confirmBtn = modal.querySelector("#fp-btn-confirm");

    function closePicker(result = null) {
      modal.classList.add("hidden");
      modal.innerHTML = "";
      window.removeEventListener("keydown", handleGlobalKey);
      resolve(result);
    }

    const handleGlobalKey = (e) => {
      if (e.key === "Escape") {
        if (!directPathInput.classList.contains("hidden")) {
          directPathInput.classList.add("hidden");
          breadcrumbBox.classList.remove("hidden");
        } else {
          closePicker(null);
        }
      } else if (e.key === "Enter" && !e.isComposing && document.activeElement !== searchInput && document.activeElement !== directPathInput) {
        confirmAction();
      } else if (e.key === "Backspace" && document.activeElement !== filenameInput && document.activeElement !== searchInput && document.activeElement !== directPathInput) {
        e.preventDefault();
        goUp();
      }
    };
    window.addEventListener("keydown", handleGlobalKey);

    modal.querySelector("#fp-close-x").onclick = () => closePicker(null);
    modal.querySelector("#fp-btn-cancel").onclick = () => closePicker(null);

    modal.querySelectorAll(".fp-place-item").forEach(item => {
      item.onclick = () => navigateTo(item.dataset.path);
    });

    modal.querySelectorAll(".fp-filter-pill").forEach(pill => {
      pill.onclick = () => {
        modal.querySelectorAll(".fp-filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeFilter = pill.dataset.filter;
        renderList();
      };
    });

    modal.querySelectorAll(".fp-th-col").forEach(col => {
      col.onclick = () => {
        const field = col.dataset.sort;
        if (sortField === field) {
          sortAsc = !sortAsc;
        } else {
          sortField = field;
          sortAsc = true;
        }
        updateSortIcons();
        renderList();
      };
    });

    function updateSortIcons() {
      ["name", "date", "size"].forEach(f => {
        const icon = modal.querySelector(`#sort-icon-${f}`);
        if (!icon) return;
        icon.innerText = (sortField === f) ? (sortAsc ? " ▲" : " ▼") : "";
      });
    }

    function renderRecentPlaces() {
      const box = modal.querySelector("#fp-recent-places-list");
      if (!box) return;
      const recents = getRecentDirs();
      box.innerHTML = recents.map(r => {
        const parts = r.split("/").filter(Boolean);
        const shortName = parts.pop() || r;
        return `
          <div class="fp-place-item" data-path="${escapeHtml(r)}" title="${escapeHtml(r)}">
            <span class="fp-place-icon-box" style="color: #8b5cf6;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </span>
            <span class="fp-place-label">${escapeHtml(shortName)}</span>
          </div>
        `;
      }).join("");

      box.querySelectorAll(".fp-place-item").forEach(item => {
        item.onclick = () => navigateTo(item.dataset.path);
      });
    }

    addressBox.onclick = (e) => {
      if (e.target.closest(".fp-breadcrumb-crumb")) return;
      breadcrumbBox.classList.add("hidden");
      directPathInput.classList.remove("hidden");
      directPathInput.value = currentDir;
      directPathInput.focus();
      directPathInput.select();
    };

    directPathInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = directPathInput.value.trim();
        if (val) navigateTo(val);
        directPathInput.classList.add("hidden");
        breadcrumbBox.classList.remove("hidden");
      }
    };

    directPathInput.onblur = () => {
      setTimeout(() => {
        directPathInput.classList.add("hidden");
        breadcrumbBox.classList.remove("hidden");
      }, 180);
    };

    function updateNavButtons() {
      btnBack.disabled = navHistoryIndex <= 0;
      btnFwd.disabled = navHistoryIndex >= navHistory.length - 1;

      const isWin = /^[a-zA-Z]:/i.test(currentDir);
      btnUp.disabled = isWin ? (currentDir.length <= 3) : (currentDir === "/");
    }

    btnBack.onclick = () => {
      if (navHistoryIndex > 0) {
        navHistoryIndex--;
        currentDir = navHistory[navHistoryIndex];
        refreshView();
      }
    };
    btnFwd.onclick = () => {
      if (navHistoryIndex < navHistory.length - 1) {
        navHistoryIndex++;
        currentDir = navHistory[navHistoryIndex];
        refreshView();
      }
    };

    function goUp() {
      const parent = getParentDir(currentDir);
      if (parent !== currentDir) {
        navigateTo(parent);
      }
    }
    btnUp.onclick = goUp;
    btnRefresh.onclick = () => refreshView();

    btnMkdir.onclick = async () => {
      const { appPrompt } = await import("./dialog.js");
      const folderName = await appPrompt({
        title: "新建文件夹",
        message: `在当前目录下创建子文件夹:\n${currentDir}`,
        placeholder: "输入文件夹名称...",
        defaultValue: "新建文件夹"
      });
      if (folderName && folderName.trim()) {
        const fullDir = joinPath(currentDir, folderName.trim());
        try {
          await callTauri("create_directory", { dirPath: fullDir });
          showToast(`📁 文件夹已创建: ${folderName.trim()}`);
          await refreshView();
          navigateTo(fullDir);
        } catch (err) {
          showToast(`⚠️ 创建文件夹失败: ${String(err)}`);
        }
      }
    };

    function navigateTo(targetPath, recordHistory = true) {
      currentDir = normalizePath(targetPath);
      recordRecentDir(currentDir);
      if (recordHistory) {
        if (navHistoryIndex < navHistory.length - 1) navHistory.splice(navHistoryIndex + 1);
        navHistory.push(currentDir);
        navHistoryIndex = navHistory.length - 1;
      }
      refreshView();
    }

    function renderBreadcrumbs() {
      breadcrumbBox.innerHTML = "";
      const isWin = /^[a-zA-Z]:/i.test(currentDir);
      const parts = currentDir.split("/").filter(Boolean);

      if (isWin) {
        const driveLetter = parts[0];
        const driveCrumb = document.createElement("span");
        driveCrumb.className = `fp-breadcrumb-crumb ${parts.length === 1 ? "current" : ""}`;
        driveCrumb.innerText = `${driveLetter}/`;
        driveCrumb.onclick = () => navigateTo(`${driveLetter}/`);
        breadcrumbBox.appendChild(driveCrumb);

        let acc = `${driveLetter}/`;
        for (let i = 1; i < parts.length; i++) {
          const p = parts[i];
          acc = joinPath(acc, p);
          const target = acc;

          const sep = document.createElement("span");
          sep.className = "fp-breadcrumb-sep";
          sep.innerText = "›";
          breadcrumbBox.appendChild(sep);

          const crumb = document.createElement("span");
          crumb.className = `fp-breadcrumb-crumb ${i === parts.length - 1 ? "current" : ""}`;
          crumb.innerText = p;
          if (i !== parts.length - 1) {
            crumb.onclick = () => navigateTo(target);
          }
          breadcrumbBox.appendChild(crumb);
        }
      } else {
        const rootCrumb = document.createElement("span");
        rootCrumb.className = `fp-breadcrumb-crumb ${parts.length === 0 ? "current" : ""}`;
        rootCrumb.innerText = "/";
        rootCrumb.onclick = () => navigateTo("/");
        breadcrumbBox.appendChild(rootCrumb);

        let acc = "";
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          acc += "/" + p;
          const target = acc;

          const sep = document.createElement("span");
          sep.className = "fp-breadcrumb-sep";
          sep.innerText = "›";
          breadcrumbBox.appendChild(sep);

          const crumb = document.createElement("span");
          crumb.className = `fp-breadcrumb-crumb ${i === parts.length - 1 ? "current" : ""}`;
          crumb.innerText = p;
          if (i !== parts.length - 1) {
            crumb.onclick = () => navigateTo(target);
          }
          breadcrumbBox.appendChild(crumb);
        }
      }

      breadcrumbBox.scrollLeft = breadcrumbBox.scrollWidth;
    }

    async function refreshView() {
      updateNavButtons();
      renderBreadcrumbs();
      renderRecentPlaces();
      selectedEntry = null;

      modal.querySelectorAll(".fp-place-item").forEach(p => {
        p.classList.toggle("active", normalizePath(p.dataset.path) === currentDir);
      });

      listContainer.innerHTML = `<div style="padding:32px 0;text-align:center;color:var(--text-tertiary);font-size:12.5px;">正在加载目录内容...</div>`;
      try {
        currentEntries = await callTauri("list_directory", { dirPath: currentDir });
        renderList();
      } catch (err) {
        listContainer.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--apple-red);font-size:12.5px;">无法访问该目录: ${escapeHtml(String(err))}</div>`;
      }
    }

    function renderList() {
      listContainer.innerHTML = "";
      const searchKw = (searchInput?.value || "").toLowerCase().trim();

      let filtered = currentEntries.filter(e => {
        if (searchKw && !e.name.toLowerCase().includes(searchKw)) return false;
        if (e.is_dir) return true;
        if (mode === "save") return true;
        if (activeFilter === "ymind") return /\.ymind$/i.test(e.name);
        if (activeFilter === "all-mind") return /\.(ymind|xmind|json|mind)$/i.test(e.name);
        return true;
      });

      filtered.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return b.is_dir ? 1 : -1;
        let cmp = 0;
        if (sortField === "size") cmp = (a.size || 0) - (b.size || 0);
        else if (sortField === "date") cmp = (a.modified || 0) - (b.modified || 0);
        else cmp = a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" });
        return sortAsc ? cmp : -cmp;
      });

      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div style="padding:48px 0;text-align:center;color:var(--text-tertiary);font-size:12px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="margin:0 auto 8px;display:block;opacity:0.5;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span>此文件夹为空</span>
          </div>
        `;
        return;
      }

      filtered.forEach((entry, idx) => {
        const row = document.createElement("div");
        row.className = "fp-file-row";
        row.dataset.idx = idx;

        const isYMind = /\.(ymind|mind|json)$/i.test(entry.name);
        const isXMind = /\.xmind$/i.test(entry.name);

        let iconSvg = "";
        let badgeHtml = "";

        if (entry.is_dir) {
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#60a5fa" stroke="#2563eb" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        } else if (isYMind) {
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0071e3" stroke-width="2.2"><circle cx="12" cy="12" r="3"></circle><path d="M12 3v6m0 6v6M3 12h6m6 0h6"></path></svg>`;
          badgeHtml = `<span class="fp-file-badge" style="background:rgba(0,113,227,0.08);color:var(--apple-blue);">导图</span>`;
        } else if (isXMind) {
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
          badgeHtml = `<span class="fp-file-badge" style="background:rgba(234,88,12,0.08);color:#c2410c;">XMind</span>`;
        } else {
          iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        }

        row.innerHTML = `
          <span class="fp-file-icon-wrap">${iconSvg}</span>
          <span class="fp-file-name">
            <span>${escapeHtml(entry.name)}</span>
            ${badgeHtml}
          </span>
          <span class="fp-file-date">${formatDate(entry.modified)}</span>
          <span class="fp-file-size">${entry.is_dir ? '—' : formatSize(entry.size)}</span>
        `;

        row.onclick = (e) => {
          e.stopPropagation();
          listContainer.querySelectorAll(".fp-file-row").forEach(r => r.classList.remove("selected"));
          row.classList.add("selected");
          selectedEntry = entry;
          if (!entry.is_dir && filenameInput) {
            filenameInput.value = entry.name;
          }
        };

        row.ondblclick = (e) => {
          e.stopPropagation();
          if (entry.is_dir) {
            navigateTo(entry.path);
          } else {
            if (filenameInput) filenameInput.value = entry.name;
            confirmAction();
          }
        };

        listContainer.appendChild(row);
      });
    }

    searchInput.oninput = () => renderList();

    function confirmAction() {
      if (mode === "open") {
        if (!selectedEntry || selectedEntry.is_dir) {
          showToast("⚠️ 请选择一个要打开的思维导图文件");
          return;
        }
        closePicker({ path: normalizePath(selectedEntry.path), name: selectedEntry.name });
      } else {
        let name = filenameInput?.value.trim() || "";
        if (!name) {
          showToast("⚠️ 请输入保存文件名");
          filenameInput?.focus();
          return;
        }
        if (!name.endsWith(".ymind") && !name.endsWith(".json")) {
          name += ".ymind";
        }
        const full = joinPath(currentDir, name);
        closePicker({ path: full, name });
      }
    }

    confirmBtn.onclick = confirmAction;
    refreshView();
  });
}