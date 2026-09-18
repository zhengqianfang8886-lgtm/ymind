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

function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const plat = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "").toLowerCase();
  if (/mac|darwin|iphone|ipad|ipod/.test(plat)) return "mac";
  if (/win/.test(plat)) return "win";
  if (/linux/.test(plat)) return "linux";
  return "other";
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchPlatformAsset(assets = [], platform = detectPlatform()) {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  if (platform === "mac") {
    return assets.find(a => a.name.endsWith(".dmg")) ||
           assets.find(a => a.name.endsWith(".app.tar.gz") || a.name.includes("darwin")) ||
           assets[0];
  }
  if (platform === "win") {
    return assets.find(a => a.name.endsWith(".msi") || a.name.endsWith(".exe")) ||
           assets.find(a => a.name.includes("windows")) ||
           assets[0];
  }
  if (platform === "linux") {
    return assets.find(a => a.name.endsWith(".AppImage")) ||
           assets.find(a => a.name.endsWith(".deb")) ||
           assets.find(a => a.name.includes("linux")) ||
           assets[0];
  }
  return assets[0];
}

export async function checkForUpdates(isManual = false) {
  const settings = getGlobalSettings();
  const repo = (settings.githubRepo || "secure-artifacts/ymind-tauri").trim();
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

  const btnCheck = typeof document !== "undefined" ? document.getElementById("btn-check-update") : null;
  const txtCheck = typeof document !== "undefined" ? document.getElementById("txt-check-update") : null;

  if (isManual) {
    showToast("🔍 正在检查最新版本...");
    if (btnCheck && txtCheck) {
      btnCheck.disabled = true;
      txtCheck.textContent = "正在检查...";
    }
  }

  try {
    const res = await fetch(apiUrl, {
      headers: { "Accept": "application/vnd.github.v3+json" }
    });

    if (!res.ok) {
      if (res.status === 404) {
        if (isManual) showToast(`⚠️ 未在 GitHub 发现版本发布 (${repo})`);
        return null;
      }
      if (res.status === 403) {
        if (isManual) showToast("⚠️ GitHub API 访问过于频繁，已受速率限制，请稍后再试");
        return null;
      }
      throw new Error(`GitHub API HTTP ${res.status}`);
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
  } finally {
    if (btnCheck && txtCheck) {
      btnCheck.disabled = false;
      txtCheck.textContent = "检查更新";
    }
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
  const repo = getGlobalSettings().githubRepo || "secure-artifacts/ymind-tauri";
  const releaseUrl = release.html_url || `https://github.com/${repo}/releases`;
  const rawChangelog = release.body || "本次更新包含稳定性提升、性能优化及细节体验打磨。";
  const releaseNotesHtml = renderMarkdown(rawChangelog);
  const pubDate = release.published_at ? new Date(release.published_at).toLocaleDateString() : "近期";

  const platform = detectPlatform();
  const matchedAsset = matchPlatformAsset(release.assets || [], platform);
  const platformLabelMap = { mac: "macOS", win: "Windows", linux: "Linux", other: "通用平台" };
  const platformName = platformLabelMap[platform] || "本机系统";

  let assetHtml = "";
  if (matchedAsset && matchedAsset.browser_download_url) {
    const sizeStr = formatBytes(matchedAsset.size);
    assetHtml = `
      <div style="background: var(--apple-blue-subtle, rgba(0, 113, 227, 0.08)); border: 1px solid rgba(0, 113, 227, 0.25); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
          <div style="font-size: 11px; font-weight: 700; color: var(--apple-blue); letter-spacing: 0.03em;">🎯 推荐适用于当前 ${platformName} 的安装包</div>
          <div style="font-size: 12.5px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(matchedAsset.name)}">${escapeHtml(matchedAsset.name)}</div>
        </div>
        <button id="btn-direct-download" class="modal-btn modal-btn-primary" style="padding: 6px 14px; font-size: 12px; white-space: nowrap; flex-shrink: 0;" data-url="${escapeHtml(matchedAsset.browser_download_url)}">
          ⚡ 立即下载 ${sizeStr ? `(${sizeStr})` : ""}
        </button>
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="apple-modal-card" style="width: 540px; max-width: 94vw;">
      <div class="apple-modal-header" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="modal-header-icon success" style="font-size: 20px;">🚀</div>
          <div class="modal-title-wrap">
            <h3 class="apple-modal-title">发现新版本 ${versionStr}</h3>
            <div style="font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px;">
              发布日期: ${escapeHtml(pubDate)} · 当前运行版本: v${APP_VERSION}
            </div>
          </div>
        </div>
        <button id="btn-update-close-x" class="inspector-close-btn" style="width: 26px; height: 26px;">✕</button>
      </div>

      <div class="apple-modal-body" style="gap: 10px;">
        ${assetHtml}
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">更新要点 (Release Notes):</div>
        <div class="notes-preview-rendered" style="max-height: 220px; overflow-y: auto; background: rgba(0,0,0,0.025); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px 14px; font-size: 12.5px; line-height: 1.6;">
          ${releaseNotesHtml}
        </div>
      </div>

      <div class="apple-modal-footer" style="justify-content: space-between; margin-top: 4px;">
        <button id="btn-update-dismiss" class="modal-btn modal-btn-secondary">稍后提醒</button>
        <button id="btn-update-view-release" class="modal-btn modal-btn-secondary" style="color: var(--apple-blue); font-weight: 600;">
          访问 GitHub Release 页面 ➔
        </button>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.querySelector("#btn-update-close-x")?.addEventListener("click", () => modal.classList.add("hidden"));
  modal.querySelector("#btn-update-dismiss")?.addEventListener("click", () => modal.classList.add("hidden"));

  modal.querySelector("#btn-direct-download")?.addEventListener("click", (e) => {
    const url = e.currentTarget?.dataset?.url;
    if (url) {
      showToast("🚀 正在调起下载链接...");
      openExternalUrl(url);
    }
  });

  modal.querySelector("#btn-update-view-release")?.addEventListener("click", () => {
    modal.classList.add("hidden");
    openExternalUrl(releaseUrl);
  });
}
