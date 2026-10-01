// YMind Pro - 内置高定开发者控制台 (In-App DevTools & F12 Engine)
let devToolsPanel = null;
let logEntries = [];
let activeFilter = "all"; // "all" | "error" | "warn" | "log"
const MAX_LOGS = 500;

async function tryOpenNativeDevTools() {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (invoke) {
    try { await invoke("open_devtools"); return true; } catch {}
    try { await invoke("plugin:developer-tools|open"); return true; } catch {}
  }
  return false;
}

export function toggleDevTools() {
  if (!devToolsPanel) createDevToolsPanel();
  const isHidden = devToolsPanel.classList.contains("hidden");
  if (isHidden) {
    devToolsPanel.classList.remove("hidden");
    renderDevToolsLogs();
    devToolsPanel.querySelector("#dev-eval-input")?.focus();
  } else {
    devToolsPanel.classList.add("hidden");
  }
}

function createDevToolsPanel() {
  devToolsPanel = document.createElement("div");
  devToolsPanel.id = "apple-devtools-drawer";
  devToolsPanel.className = "apple-devtools-drawer hidden";

  devToolsPanel.innerHTML = `
    <div class="dev-header">
      <div class="dev-title-row">
        <span class="dev-tag">⚡ DEVTOOLS</span>
        <span style="font-size:12px;font-weight:700;color:var(--text-primary);">系统运行控制台</span>
      </div>
      <div class="dev-filter-tabs">
        <button class="dev-tab-btn active" data-filter="all">全部 (<span id="dev-count-all">0</span>)</button>
        <button class="dev-tab-btn" data-filter="error" style="color:var(--apple-red);">错误 (<span id="dev-count-error">0</span>)</button>
        <button class="dev-tab-btn" data-filter="warn" style="color:var(--apple-orange);">警告 (<span id="dev-count-warn">0</span>)</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
        <button id="dev-btn-copy" class="dev-tool-btn" title="一键复制全部错误堆栈">📋 复制报错</button>
        <button id="dev-btn-clear" class="dev-tool-btn" title="清空控制台">清空</button>
        <button id="dev-btn-close" class="dev-tool-btn" style="font-weight:700;">✕</button>
      </div>
    </div>
    <div id="dev-logs-scroll" class="dev-logs-body"></div>
    <div class="dev-cli-bar">
      <span class="dev-prompt-symbol">❯</span>
      <input id="dev-eval-input" class="dev-eval-field" placeholder="输入 JavaScript 表达式并按回车执行 (如 state.tabs)..." autocomplete="off" spellcheck="false" />
    </div>
  `;

  document.body.appendChild(devToolsPanel);

  devToolsPanel.querySelector("#dev-btn-close").onclick = () => devToolsPanel.classList.add("hidden");
  devToolsPanel.querySelector("#dev-btn-clear").onclick = () => {
    logEntries = [];
    renderDevToolsLogs();
  };
  devToolsPanel.querySelector("#dev-btn-copy").onclick = () => {
    const errorLogs = logEntries.filter(l => l.level === "error").map(l => `[${l.time}] ${l.message}\n${l.stack || ''}`).join('\n---\n');
    navigator.clipboard.writeText(errorLogs || "暂无错误日志").then(() => {
      import("./dialog.js").then(d => d.showToast("📋 已复制错误日志到剪贴板"));
    });
  };

  devToolsPanel.querySelectorAll(".dev-tab-btn").forEach(btn => {
    btn.onclick = () => {
      devToolsPanel.querySelectorAll(".dev-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      renderDevToolsLogs();
    };
  });

  const evalInput = devToolsPanel.querySelector("#dev-eval-input");
  evalInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      const code = evalInput.value.trim();
      if (!code) return;
      evalInput.value = "";
      captureLog("log", `❯ ${code}`);
      try {
        const result = window.eval(code);
        captureLog("log", `< ${typeof result === "object" ? JSON.stringify(result) : String(result)}`);
      } catch (err) {
        captureLog("error", `< 异常: ${err.message}`, err.stack);
      }
      renderDevToolsLogs();
    }
  };
}

function captureLog(level, message, stack = "") {
  const pad = n => String(n).padStart(2, "0");
  const d = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;

  logEntries.push({ level, message, stack, time });
  if (logEntries.length > MAX_LOGS) logEntries.shift();

  if (devToolsPanel && !devToolsPanel.classList.contains("hidden")) {
    renderDevToolsLogs();
  }
}

function renderDevToolsLogs() {
  if (!devToolsPanel) return;
  const body = devToolsPanel.querySelector("#dev-logs-scroll");
  const countAll = devToolsPanel.querySelector("#dev-count-all");
  const countError = devToolsPanel.querySelector("#dev-count-error");
  const countWarn = devToolsPanel.querySelector("#dev-count-warn");

  const errors = logEntries.filter(l => l.level === "error").length;
  const warns = logEntries.filter(l => l.level === "warn").length;

  if (countAll) countAll.innerText = logEntries.length;
  if (countError) countError.innerText = errors;
  if (countWarn) countWarn.innerText = warns;

  let filtered = logEntries;
  if (activeFilter === "error") filtered = logEntries.filter(l => l.level === "error");
  if (activeFilter === "warn") filtered = logEntries.filter(l => l.level === "warn");

  if (filtered.length === 0) {
    body.innerHTML = `<div style="padding:28px 0;text-align:center;color:var(--text-tertiary);font-size:12px;">控制台暂无 ${activeFilter === 'all' ? '' : activeFilter} 日志</div>`;
    return;
  }

  body.innerHTML = filtered.map(item => `
    <div class="dev-log-row ${item.level}">
      <span class="dev-log-time">${item.time}</span>
      <span class="dev-log-badge">${item.level.toUpperCase()}</span>
      <div class="dev-log-content">
        <div class="dev-log-msg">${item.message}</div>
        ${item.stack ? `<pre class="dev-log-stack">${item.stack}</pre>` : ''}
      </div>
    </div>
  `).join("");

  body.scrollTop = body.scrollHeight;
}

export function initDevTools() {
  // 1. 劫持 console 与全局未捕获异常
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;

  console.error = (...args) => {
    originalError.apply(console, args);
    const msg = args.map(a => (typeof a === "object" ? (a?.stack || JSON.stringify(a)) : String(a))).join(" ");
    const stack = (args[0] instanceof Error) ? args[0].stack : "";
    captureLog("error", msg, stack);
  };

  console.warn = (...args) => {
    originalWarn.apply(console, args);
    const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    captureLog("warn", msg);
  };

  console.log = (...args) => {
    originalLog.apply(console, args);
    const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    captureLog("log", msg);
  };

  window.addEventListener("error", (e) => {
    captureLog("error", e.message || "Uncaught Error", `${e.filename}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener("unhandledrejection", (e) => {
    captureLog("error", `Promise Rejection: ${e.reason?.message || String(e.reason)}`, e.reason?.stack || "");
  });

  // 2. 物理捕获全局 F12 / Ctrl+Shift+I / Cmd+Option+I
  window.addEventListener("keydown", async (e) => {
    const isF12 = e.key === "F12" || e.keyCode === 123;
    const isCtrlShiftI = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "i");
    const isMacDev = e.metaKey && e.altKey && (e.key === "I" || e.key === "i");

    if (isF12 || isCtrlShiftI || isMacDev) {
      e.preventDefault();
      e.stopPropagation();
      const opened = await tryOpenNativeDevTools();
      if (!opened) {
        toggleDevTools();
      }
    }
  }, true);
}
