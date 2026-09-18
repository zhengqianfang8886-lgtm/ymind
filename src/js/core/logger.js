let logBuffer = [];
const MAX_BUFFER = 1000;
let flushTimer = null;

// 确保写入当前运行目录
const LOG_FILENAME = "ymind_debug.log";

async function callTauri(cmd, args = {}) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
  if (invoke) return await invoke(cmd, args);
  return null;
}

export const logger = {
  info(tag, ...details) { this.log("INFO", tag, ...details); },
  warn(tag, ...details) { this.log("WARN", tag, ...details); },
  error(tag, ...details) { this.log("ERROR", tag, ...details); },

  log(level, tag, ...details) {
    const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
    const detailStr = details.map(d => (typeof d === "object" ? JSON.stringify(d) : String(d))).join(" ");
    const line = `[${ts}] [${level}] [${tag}] ${detailStr}`;

    if (level === "ERROR") console.error(line);
    else if (level === "WARN") console.warn(line);
    else console.log(line);

    logBuffer.push(line);
    if (logBuffer.length > MAX_BUFFER) logBuffer.shift();

    if (typeof window !== "undefined") {
      window.__YMIND_LOGS__ = logBuffer;
    }

    this.scheduleFlush();
  },

  scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      this.flushToDisk();
    }, 300);
  },

  async flushToDisk() {
    if (logBuffer.length === 0) return;
    const content = logBuffer.join("\n") + "\n";
    try {
      // 1. 尝试专属日志指令
      let ok = await callTauri("write_log", { message: content, filename: LOG_FILENAME });
      if (!ok) {
        ok = await callTauri("append_log", { logText: content, filename: LOG_FILENAME });
      }
      // 2. 尝试 save_mindmap_file 写入当前运行相对路径
      if (!ok) {
        await callTauri("save_mindmap_file", {
          path: LOG_FILENAME,
          defaultName: LOG_FILENAME,
          content: content
        });
      }
    } catch (e) {
      console.warn("[Logger] Local write attempt failed:", e);
    }
  },

  // 提供前端直接下载当前运行日志兜底
  downloadLogs() {
    const blob = new Blob([logBuffer.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = LOG_FILENAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
};

if (typeof window !== "undefined") {
  window.__YMIND_LOGGER__ = logger;
  window.__YMIND_LOGS__ = logBuffer;
  logger.info("System", "Logger initialized. Target file: ./ymind_debug.log");
}
