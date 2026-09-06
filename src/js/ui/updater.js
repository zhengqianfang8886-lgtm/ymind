import { getGlobalSettings, APP_VERSION } from "../core/config.js";
import { renderMarkdown } from "./notes.js";
import { showToast, escapeHtml } from "./dialog.js";

export { APP_VERSION };

export function compareSemVer(v1, v2) {
  const parse = (v) => String(v || "").trim().replace(/^[vV]/, "").split(".").map(n => parseInt(n, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export async function openExternalUrl(url) {
  if (!url) return;
  const targetUrl = String(url).trim();

  // 1. 尝试 Tauri 2.0 官方 opener 插件
  try {
    if (window.__TAURI__?.opener?.openUrl) {
      await window.__TAURI__.opener.openUrl(targetUrl);
      return;
    }
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (invoke) {
      try {
        await invoke("plugin:opener|open_url", { url: targetUrl });
        return;
      } catch {}
    }
  } catch {}

  // 2. 尝试 Tauri 1.0 / 2.0 Shell 插件
  try {
    if (window.__TAURI__?.shell?.open) {
      await window.__TAURI__.shell.open(targetUrl);
      return;
    }
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (invoke) {
      try {
        await invoke("plugin:shell|open", { path: targetUrl });
        return;
      } catch {}
      try {
        await invoke("open_external_url", { url: targetUrl });
        return;
      } catch {}
    }
  } catch {}

  // 3. 兜底方案：通过 DOM 虚拟锚点触发系统浏览器外链分发
  try {
    const a = document.createElement("a");
    a.href = targetUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
    return;
  } catch {}

  window.open(targetUrl, "_blank");
}

export async function checkForUpdates(isManual = false) {
  const settings = getGlobalSettings();
  const repo = (settings.githubRepo || "lfw/ymind-tauri").trim();
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

  if (isManual) showToast("🔍 正在检查最新版本...");

  try {
    const res = await fetch(apiUrl, {
      headers: { "Accept": "application/vnd.github.v3+json" }
    });

    if (!res.ok) {
      if (res.status === 404) {
        if (isManual) showToast("⚠️ 未找到版本发布记录 (GitHub Releases 404)");
        return null;
      }
      throw new Error(`GitHub API Error: ${res.status}`);
    }

    const data = await res.json();
    const remoteTag = data.tag_name || "";
    const hasUpdate = compareSemVer(remoteTag, APP_VERSION) > 0;

    if (hasUpdate) {
      showUpdateModal(data);
      return data;
    } else {
      if (isManual) showToast(`🎉 当前已是最新版本 (v${APP_VERSION})`);
      return null;
    }
  } catch (err) {
    if (isManual) showToast("⚠️ 检查更新失败，请检查网络连接");
    console.warn("[Updater] Check failed:", err);
    return null;
  }
}

export function showUpdateModal(release) {
  let modal = document.getElementById("apple-update-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "apple-update-modal";
    modal.className = "apple-modal-overlay hidden";
    document.body.appendChild(modal);
  }

  const versionStr = escapeHtml(release.tag_name || "最新版本");
  const releaseUrl = release.html_url || `https://github.com/${getGlobalSettings().githubRepo || "lfw/ymind-tauri"}/releases`;
  const rawChangelog = release.body || "本次更新包含稳定性提升、性能优化及界面细节打磨。";
  const releaseNotesHtml = renderMarkdown(rawChangelog);
  const pubDate = release.published_at ? new Date(release.published_at).toLocaleDateString() : "近期";

  modal.innerHTML = `
    <div class="apple-modal-card" style="width: 500px; max-width: 92vw;">
      <div class="apple-modal-header" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="modal-header-icon success">🚀</div>
          <div class="modal-title-wrap">
            <h3 class="apple-modal-title">发现新版本 ${versionStr}</h3>
            <div style="font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px;">
              发布日期: ${escapeHtml(pubDate)} · 当前运行版本: v${APP_VERSION}
            </div>
          </div>
        </div>
        <button id="btn-update-close-x" class="inspector-close-btn" style="width: 26px; height: 26px;">✕</button>
      </div>

      <div class="apple-modal-body" style="gap: 8px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">更新日志 (Release Notes):</div>
        <div class="notes-preview-rendered" style="max-height: 240px; overflow-y: auto; background: rgba(0,0,0,0.025); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 14px; font-size: 12.5px; line-height: 1.6;">
          ${releaseNotesHtml}
        </div>
      </div>

      <div class="apple-modal-footer" style="justify-content: space-between; margin-top: 4px;">
        <button id="btn-update-dismiss" class="modal-btn modal-btn-secondary">稍后提醒</button>
        <button id="btn-update-download" class="modal-btn modal-btn-primary">前往 GitHub 下载发布包 ➔</button>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.querySelector("#btn-update-close-x").onclick = () => modal.classList.add("hidden");
  modal.querySelector("#btn-update-dismiss").onclick = () => modal.classList.add("hidden");
  modal.querySelector("#btn-update-download").onclick = () => {
    modal.classList.add("hidden");
    openExternalUrl(releaseUrl);
  };
}
