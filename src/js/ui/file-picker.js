import { escapeHtml, showToast } from "./dialog.js";

async function callTauri(cmd, args = {}) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (invoke) return await invoke(cmd, args);
  throw new Error("TAURI_IPC_UNAVAILABLE");
}

let currentDir = "";
let navHistory = [];
let navHistoryIndex = -1;
let systemPlaces = null;
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
  if (!dir || dir === "/") return;
  try {
    let list = getRecentDirs().filter(d => d !== dir);
    list.unshift(dir);
    if (list.length > 5) list.pop();
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
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadPlaces() {
  if (systemPlaces) return systemPlaces;
  try {
    systemPlaces = await callTauri("get_system_places");
  } catch {
    systemPlaces = {
      home: "/home",
      documents: "/home/Documents",
      desktop: "/home/Desktop",
      downloads: "/home/Downloads"
    };
  }
  return systemPlaces;
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

    const places = await loadPlaces();
    if (initialDir && initialDir.startsWith("/")) {
      currentDir = initialDir;
    } else if (!currentDir) {
      currentDir = places.documents || places.home || "/";
    }

    navHistory = [currentDir];
    navHistoryIndex = 0;
    recordRecentDir(currentDir);

    modal.innerHTML = `
      <div class="apple-modal-card apple-file-picker-card">
        <div class="fp-header-bar">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="modal-header-icon primary" style="font-size:18px;">${mode === "open" ? "📂" : "💾"}</div>
            <div class="modal-title-wrap">
              <h3 class="apple-modal-title">${mode === "open" ? "打开思维导图文件" : "保存思维导图文件"}</h3>
              <span style="font-size:11px;color:var(--text-tertiary);">原生高定极速通道 · 支持双击快速直达与智能路径记忆</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button id="fp-btn-mkdir" class="modal-btn modal-btn-secondary" style="padding:4px 10px;font-size:11.5px;" title="在当前目录下新建文件夹">
              <span>📁+ 新建文件夹</span>
            </button>
            <button id="fp-close-x" class="inspector-close-btn" style="width:28px;height:28px;">✕</button>
          </div>
        </div>

        <div class="fp-nav-toolbar">
          <button id="fp-btn-back" class="fp-tool-btn" title="后退 (Alt+Left)">◀</button>
          <button id="fp-btn-fwd" class="fp-tool-btn" title="前进 (Alt+Right)">▶</button>
          <button id="fp-btn-up" class="fp-tool-btn" title="上一层目录 (Backspace)">⬆</button>
          <button id="fp-btn-refresh" class="fp-tool-btn" title="刷新目录">🔄</button>

          <div id="fp-address-box" class="fp-breadcrumb-trail" title="单击路径可编辑绝对路径">
            <div id="fp-breadcrumbs" style="display:flex;align-items:center;gap:2px;"></div>
            <input id="fp-direct-path" class="fp-path-direct-input hidden" placeholder="输入路径后按回车跳转..." />
          </div>

          <input id="fp-search" type="text" placeholder="🔍 过滤当前项..." style="width:125px;font-size:11.5px;padding:4px 8px;border:none;background:rgba(0,0,0,0.05);border-radius:6px;outline:none;" />
        </div>

        <div class="fp-body">
          <aside class="fp-sidebar">
            <div class="fp-sidebar-title">系统位置</div>
            <div class="fp-place-item" data-path="${escapeHtml(places.home)}"><span>🏠</span><span>主目录</span></div>
            ${places.documents ? `<div class="fp-place-item" data-path="${escapeHtml(places.documents)}"><span>📄</span><span>文档</span></div>` : ""}
            ${places.desktop ? `<div class="fp-place-item" data-path="${escapeHtml(places.desktop)}"><span>🖥️</span><span>桌面</span></div>` : ""}
            ${places.downloads ? `<div class="fp-place-item" data-path="${escapeHtml(places.downloads)}"><span>📥</span><span>下载</span></div>` : ""}
            <div class="fp-place-item" data-path="/"><span>💾</span><span>根目录 (/)</span></div>

            <div class="fp-sidebar-title" style="margin-top:6px;">最近访问</div>
            <div id="fp-recent-places-list" style="display:flex;flex-direction:column;gap:2px;"></div>
          </aside>

          <main class="fp-content-area">
            <div class="fp-table-header">
              <div class="fp-th-col" data-sort="name" style="flex:1;">
                <span>名称</span><span id="sort-icon-name">▲</span>
              </div>
              <div class="fp-th-col" data-sort="date" style="width:130px;">
                <span>修改日期</span><span id="sort-icon-date"></span>
              </div>
              <div class="fp-th-col" data-sort="size" style="width:75px;justify-content:flex-end;">
                <span>大小</span><span id="sort-icon-size"></span>
              </div>
            </div>
            <div id="fp-list-view" class="fp-file-list" tabindex="0"></div>
          </main>
        </div>

        <div class="fp-footer">
          <div style="flex:1;display:flex;align-items:center;gap:8px;min-width:0;">
            ${mode === "save" ? `
              <span style="font-size:12px;font-weight:700;color:var(--text-primary);flex-shrink:0;">保存文件名:</span>
              <input id="fp-filename-input" class="apple-modal-input" style="padding:6px 10px;font-size:12px;font-weight:600;" value="${escapeHtml(defaultName)}" />
            ` : `
              <span style="font-size:12px;color:var(--text-tertiary);flex-shrink:0;">文件格式:</span>
              <button class="fp-filter-pill active" data-filter="all-mind">全部思维导图</button>
              <button class="fp-filter-pill" data-filter="ymind">.ymind</button>
              <button class="fp-filter-pill" data-filter="all">所有文件</button>
            `}
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <button id="fp-btn-cancel" class="modal-btn modal-btn-secondary">取消</button>
            <button id="fp-btn-confirm" class="modal-btn modal-btn-primary">${mode === "open" ? "打开" : "保存到此处"}</button>
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

    // 列头排序响应
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
        if (sortField === f) {
          icon.innerText = sortAsc ? " ▲" : " ▼";
        } else {
          icon.innerText = "";
        }
      });
    }

    function renderRecentPlaces() {
      const box = modal.querySelector("#fp-recent-places-list");
      if (!box) return;
      const recents = getRecentDirs();
      box.innerHTML = recents.map(r => {
        const shortName = r.split("/").pop() || r;
        return `
          <div class="fp-place-item" data-path="${escapeHtml(r)}" title="${escapeHtml(r)}">
            <span>📁</span><span style="font-size:11px;">${escapeHtml(shortName)}</span>
          </div>
        `;
      }).join("");

      box.querySelectorAll(".fp-place-item").forEach(item => {
        item.onclick = () => navigateTo(item.dataset.path);
      });
    }

    // 路径直达输入与面包屑切换
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
      btnUp.disabled = currentDir === "/" || !currentDir.includes("/");
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
      const parts = currentDir.split("/").filter(Boolean);
      if (parts.length > 0) {
        parts.pop();
        navigateTo("/" + parts.join("/"));
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
        const fullDir = (currentDir === "/" ? "" : currentDir) + "/" + folderName.trim();
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
      let clean = (targetPath || "/").replace(/\\+/g, "/").replace(/\/+/g, "/");
      if (clean.length > 1 && clean.endsWith("/")) clean = clean.slice(0, -1);
      if (!clean.startsWith("/")) clean = "/" + clean;
      currentDir = clean;
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
      const parts = currentDir.split("/").filter(Boolean);
      let accPath = "";

      const rootCrumb = document.createElement("span");
      rootCrumb.className = `fp-breadcrumb-crumb ${parts.length === 0 ? "current" : ""}`;
      rootCrumb.innerText = "根目录 /";
      rootCrumb.onclick = () => navigateTo("/");
      breadcrumbBox.appendChild(rootCrumb);

      parts.forEach((p, idx) => {
        accPath += "/" + p;
        const target = accPath;
        const sep = document.createElement("span");
        sep.innerText = "›";
        sep.style.color = "var(--text-tertiary)";
        breadcrumbBox.appendChild(sep);

        const crumb = document.createElement("span");
        crumb.className = `fp-breadcrumb-crumb ${idx === parts.length - 1 ? "current" : ""}`;
        crumb.innerText = p;
        if (idx !== parts.length - 1) {
          crumb.onclick = () => navigateTo(target);
        }
        breadcrumbBox.appendChild(crumb);
      });
      breadcrumbBox.scrollLeft = breadcrumbBox.scrollWidth;
    }

    async function refreshView() {
      updateNavButtons();
      renderBreadcrumbs();
      renderRecentPlaces();
      selectedEntry = null;

      modal.querySelectorAll(".fp-place-item").forEach(p => {
        p.classList.toggle("active", p.dataset.path === currentDir);
      });

      listContainer.innerHTML = `<div style="padding:28px 0;text-align:center;color:var(--text-tertiary);font-size:12.5px;">正在加载目录内容...</div>`;
      try {
        currentEntries = await callTauri("list_directory", { dirPath: currentDir });
        renderList();
      } catch (err) {
        listContainer.innerHTML = `<div style="padding:28px 12px;text-align:center;color:var(--apple-red);font-size:12.5px;">无法访问该目录: ${escapeHtml(String(err))}</div>`;
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
        listContainer.innerHTML = `<div style="padding:40px 0;text-align:center;color:var(--text-tertiary);font-size:12px;"><span style="font-size:24px;display:block;margin-bottom:6px;">📂</span>此文件夹为空</div>`;
        return;
      }

      filtered.forEach((entry, idx) => {
        const row = document.createElement("div");
        row.className = "fp-file-row";
        row.dataset.idx = idx;

        const isYMind = /\.(ymind|json|mind)$/i.test(entry.name);
        const isXMind = /\.xmind$/i.test(entry.name);

        let icon = "📄";
        let badgeTag = "";
        if (entry.is_dir) {
          icon = "📁";
        } else if (isYMind) {
          icon = "🧠";
          badgeTag = `<span style="font-size:10px;background:rgba(0,113,227,0.1);color:var(--apple-blue);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:600;">YMind</span>`;
        } else if (isXMind) {
          icon = "📑";
          badgeTag = `<span style="font-size:10px;background:rgba(255,149,0,0.1);color:#d97706;padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:600;">XMind</span>`;
        }

        row.innerHTML = `
          <span class="fp-file-icon">${icon}</span>
          <span class="fp-file-name">${escapeHtml(entry.name)}${badgeTag}</span>
          <span class="fp-file-date">${formatDate(entry.modified)}</span>
          <span class="fp-file-size">${entry.is_dir ? '目录' : formatSize(entry.size)}</span>
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
        closePicker({ path: selectedEntry.path, name: selectedEntry.name });
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
        const full = (currentDir === "/" ? "" : currentDir) + "/" + name;
        closePicker({ path: full, name });
      }
    }

    confirmBtn.onclick = confirmAction;
    refreshView();
  });
}
