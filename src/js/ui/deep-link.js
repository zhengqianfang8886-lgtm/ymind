import { state, getActiveTab, findNode, getAncestors, getActiveDocumentContext } from "../core/state.js";
import { locateFocusedNode, smartAdaptiveCenter } from "../core/camera.js";
import { openExternalUrl } from "./updater.js";
import { showToast, escapeHtml } from "./dialog.js";
import { executeCommand, COMMANDS } from "../core/history.js";
import { getRecentDocs } from "./home.js";
import { bus, EVENTS } from "../core/event-bus.js";

/**
 * 🌟 依据当前活跃文档的磁盘目录，将相对路径解析为规范的物理绝对路径
 */
export function resolvePathAgainstActiveDoc(targetPath) {
  if (!targetPath) return "";
  let p = targetPath.replace(/^file:\/\//i, "").trim();
  const isAbsolute = p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p);
  if (isAbsolute) return p;

  const activeTab = getActiveTab();
  if (!activeTab?.filePath) return p;

  const base = activeTab.filePath;
  const isWin = base.includes("\\") || /^[a-zA-Z]:/.test(base);
  const sep = isWin ? "\\" : "/";
  const lastSep = isWin ? Math.max(base.lastIndexOf("\\"), base.lastIndexOf("/")) : base.lastIndexOf("/");
  if (lastSep === -1) return p;

  const baseDir = base.substring(0, lastSep);
  const combined = baseDir + sep + p;
  const segments = combined.split(/[\\/]/);
  const stack = [];
  for (const seg of segments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(seg);
    }
  }
  const prefix = base.startsWith("/") ? "/" : "";
  return prefix + stack.join(sep);
}

/**
 * 🌟 解析 YMind 全协议深度链接（支持外部 URL、图内节点、跨文件路径）
 */
export function parseDeepLink(url) {
  const str = String(url || "").trim();
  if (!str) return null;

  if (/^https?:\/\/|^mailto:/i.test(str)) {
    return { type: "external", url: str };
  }
  if (str.startsWith("#")) {
    return { type: "internal-node", nodeId: str.slice(1) };
  }
  if (str.startsWith("ymind://node/")) {
    return { type: "internal-node", nodeId: str.replace("ymind://node/", "") };
  }

  // 1. 标准 ymind 协议链接: ymind://file?path=...&node=...
  if (str.startsWith("ymind://file") || str.startsWith("ymind://open")) {
    try {
      const u = new URL(str);
      const filePath = u.searchParams.get("path") || u.searchParams.get("file");
      const nodeId = u.searchParams.get("node") || u.hash.replace("#", "") || null;
      return { type: "cross-doc", filePath: filePath ? decodeURIComponent(filePath) : null, nodeId };
    } catch {
      const m = str.match(/path=([^&]+)/);
      const n = str.match(/node=([^&]+)/);
      return {
        type: "cross-doc",
        filePath: m ? decodeURIComponent(m[1]) : null,
        nodeId: n ? decodeURIComponent(n[1]) : null
      };
    }
  }

  // 2. 本地原生物理路径与相对路径支持 (例如 /path/doc.ymind#node_123, ./plan.ymind)
  let cleanPath = str.replace(/^file:\/\//i, "");
  let targetNodeId = null;
  if (cleanPath.includes("#")) {
    const parts = cleanPath.split("#");
    cleanPath = parts[0];
    targetNodeId = parts[1] || null;
  }

  const isLikelyFilePath =
    cleanPath.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(cleanPath) ||
    cleanPath.startsWith("./") ||
    cleanPath.startsWith("../") ||
    /\.(ymind|xmind|mind|json|txt|md|pdf|docx?|xlsx?|png|jpe?g)$/i.test(cleanPath);

  if (isLikelyFilePath) {
    return { type: "cross-doc", filePath: cleanPath, nodeId: targetNodeId };
  }

  return null;
}

/**
 * 🌟 统一深度链接穿透导航入口
 */
export async function navigateDeepLink(url) {
  const parsed = parseDeepLink(url);
  if (!parsed) {
    showToast("⚠️ 无效或不受支持的链接格式");
    return;
  }

  // 1. 外部网页或邮件链接
  if (parsed.type === "external") {
    showToast("🌐 正在打开系统浏览器...");
    await openExternalUrl(parsed.url);
    return;
  }

  // 2. 当前导图内跨分支节点定位
  if (parsed.type === "internal-node") {
    focusInternalNode(parsed.nodeId);
    return;
  }

  // 3. 跨文档/跨文件穿透
  if (parsed.type === "cross-doc") {
    await navigateCrossDocument(parsed.filePath, parsed.nodeId);
  }
}

/**
 * 定位并平滑聚焦当前图内的目标节点
 */
export function focusInternalNode(nodeId) {
  const docCtx = getActiveDocumentContext();
  if (!docCtx || !docCtx.mindData) return false;

  const target = findNode(nodeId, docCtx.mindData);
  if (!target) {
    showToast("⚠️ 当前导图中未找到目标节点");
    return false;
  }

  const ancestors = getAncestors(nodeId, docCtx.mindData);
  let hasExpanded = false;
  if (ancestors) {
    ancestors.forEach(a => {
      if (a.id !== nodeId && a.collapsed) {
        a.collapsed = false;
        hasExpanded = true;
      }
    });
  }

  if (hasExpanded) {
    docCtx.markLayoutDirty(nodeId);
  }

  docCtx.selectNode(nodeId);
  bus.emit(EVENTS.RENDER_APP);
  locateFocusedNode(nodeId, true, docCtx, true);
  showToast(`🎯 已跳转至节点「${target.text || "主题"}」`);
  return true;
}

/**
 * 🌟 跨物理文件穿透加载与标签页调度
 */
export async function navigateCrossDocument(filePath, targetNodeId) {
  if (!filePath) {
    showToast("⚠️ 跨文档链接缺少目标文件路径");
    return;
  }

  const resolvedPath = resolvePathAgainstActiveDoc(filePath);
  const isMindMapFile = /\.(ymind|xmind|mind|json|txt|md)$/i.test(resolvedPath);

  // A. 若目标属于外部参考格式（如 PDF、Office 资料），调起系统默认程序打开
  if (!isMindMapFile) {
    // 🌟 P1-5 防御：严格安全扩展名过滤，杜绝被诱导调起系统可执行程序或恶意脚本
    const isDangerousExt = /\.(exe|bat|cmd|sh|bash|zsh|app|vbs|vbe|js|jse|wsf|wsh|msc|msi|msp|ps1|ps2|com|scr|pif|jar|reg|bin)$/i.test(resolvedPath);
    if (isDangerousExt) {
      showToast("⚠️ 出于安全考虑，禁止直接调起系统可执行程序或脚本文件");
      return;
    }
    const isSafeDocExt = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|tsv|png|jpe?g|gif|webp|svg|bmp|ico|mp3|wav|ogg|mp4|webm|zip|tar|gz)$/i.test(resolvedPath);
    if (!isSafeDocExt) {
      showToast("⚠️ 不支持或未知的安全参考文件类型");
      return;
    }
    showToast("📄 正在调起系统默认应用程序查看资料...");
    await openExternalUrl(`file://${resolvedPath}`);
    return;
  }

  showToast("📂 正在定位并打开目标思维导图...");

  // B. 检查目标导图是否已在现有标签页中打开
  const normResolved = resolvedPath.toLowerCase().replace(/\\/g, "/");
  const existingTab = state.tabs.find(t => t.filePath && t.filePath.toLowerCase().replace(/\\/g, "/") === normResolved);

  if (existingTab) {
    const { activateTab } = await import("../core/tab-manager.js");
    activateTab(existingTab.id);
    if (targetNodeId) {
      setTimeout(() => focusInternalNode(targetNodeId), 140);
    }
    showToast(`📑 已切换至已打开的「${existingTab.title}」`);
    return;
  }

  // C. 目标导图未打开：从磁盘调入新标签页
  try {
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (invoke) {
      const content = await invoke("read_file_content", { path: resolvedPath });
      if (content) {
        const { handleLoadedFileContent } = await import("./events.js");
        await handleLoadedFileContent(content, resolvedPath);
        if (targetNodeId) {
          setTimeout(() => focusInternalNode(targetNodeId), 240);
        }
        return;
      }
    }
  } catch (err) {
    console.warn("[DeepLink] Failed to load target file:", err);
  }

  showToast(`⚠️ 无法直接打开目标文件: ${resolvedPath}`);
}

/**
 * 生成并复制节点专属深度链接
 */
export async function copyNodeDeepLink(node) {
  if (!node) return;
  const curTab = getActiveTab();
  let linkUri = "";
  if (curTab?.filePath) {
    linkUri = `ymind://file?path=${encodeURIComponent(curTab.filePath)}&node=${encodeURIComponent(node.id)}`;
  } else {
    linkUri = `ymind://node/${node.id}`;
  }

  try {
    await navigator.clipboard.writeText(linkUri);
    showToast(`📋 已复制「${node.text || "节点"}」的跨文档深度链接`);
  } catch {
    showToast("⚠️ 复制失败，请检查剪贴板权限");
  }
}

/**
 * 🌟 高级 Apple 拟态链接构建模态框（支持文件浏览、标签页选取与同图节点关联）
 */
export async function promptEditNodeLink(node) {
  if (!node) return;
  const currentLink = node.link || "";

  const overlay = document.getElementById("apple-system-dialog-overlay");
  if (!overlay) return;

  const otherTabs = state.tabs.filter(t => t.id !== state.activeTabId);
  const recentFiles = getRecentDocs();
  const curRoot = getActiveDocumentContext()?.mindData;
  const internalNodes = [];
  function scanNodes(n, depth = 0) {
    if (!n) return;
    if (n.id !== node.id) {
      internalNodes.push({ id: n.id, text: "— ".repeat(depth) + (n.text || "分支") });
    }
    if (n.children) n.children.forEach(c => scanNodes(c, depth + 1));
  }
  scanNodes(curRoot);

  overlay.innerHTML = `
    <div class="apple-modal-card" style="width: 520px; max-width: 92vw; gap: 14px;">
      <div class="apple-modal-header" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="modal-header-icon primary" style="font-size: 18px;">🔗</div>
          <div class="modal-title-wrap">
            <h3 class="apple-modal-title">设置节点链接与跨文件跳转</h3>
            <span style="font-size: 11.5px; color: var(--text-tertiary);">为「${escapeHtml(node.text || "节点")}」配置跳转入口</span>
          </div>
        </div>
        <button id="btn-link-close-x" class="inspector-close-btn">✕</button>
      </div>

      <div class="apple-modal-body" style="gap: 10px;">
        <div>
          <label style="font-size: 11.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; display: block;">链接目标地址 (URL / 物理文件路径 / #节点ID)</label>
          <input type="text" id="link-modal-input" class="apple-modal-input" placeholder="输入网址、相对/绝对路径，或点击下方快捷填入..." value="${escapeHtml(currentLink)}" autocomplete="off" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.025); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 10px 12px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">⚡ 跨文件与图内快速选取</span>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btn-link-pick-file" class="doc-action-btn" style="background: #ffffff; border: 1px solid var(--border-subtle); font-size: 11.5px; font-weight: 600; color: var(--apple-blue); padding: 5px 10px; border-radius: 6px;">📂 浏览选择本地物理文件...</button>
            <button id="btn-link-test-nav" class="doc-action-btn" style="background: #ffffff; border: 1px solid var(--border-subtle); font-size: 11.5px; padding: 5px 10px; border-radius: 6px;">🚀 测试跳转</button>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
            <div>
              <span style="font-size: 10.5px; color: var(--text-tertiary); display: block; margin-bottom: 2px;">📑 引用其他打开的文档:</span>
              <select id="sel-link-open-tab" class="apple-modal-input" style="padding: 4px 8px; font-size: 11.5px;">
                <option value="">-- 选择已打开标签页 --</option>
                ${otherTabs.map(t => `<option value="${escapeHtml(t.filePath ? t.filePath : ('tab:' + t.id))}">${escapeHtml(t.title)}</option>`).join("")}
              </select>
            </div>
            <div>
              <span style="font-size: 10.5px; color: var(--text-tertiary); display: block; margin-bottom: 2px;">🎯 关联当前导图节点:</span>
              <select id="sel-link-node" class="apple-modal-input" style="padding: 4px 8px; font-size: 11.5px;">
                <option value="">-- 选择图内目标节点 --</option>
                ${internalNodes.slice(0, 50).map(n => `<option value="#${n.id}">${escapeHtml(n.text)}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="apple-modal-footer" style="justify-content: space-between; margin-top: 4px;">
        <button id="btn-link-clear" class="modal-btn modal-btn-secondary ${currentLink ? '' : 'hidden'}" style="color: var(--apple-red);">清除链接</button>
        <div style="display: flex; gap: 8px; margin-left: auto;">
          <button id="btn-link-cancel" class="modal-btn modal-btn-secondary">取消</button>
          <button id="btn-link-save" class="modal-btn modal-btn-primary">保存链接</button>
        </div>
      </div>
    </div>
  `;

  overlay.classList.remove("hidden");
  const inputEl = overlay.querySelector("#link-modal-input");
  inputEl?.focus();

  const closeDialog = () => {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  };

  overlay.querySelector("#btn-link-close-x")?.addEventListener("click", closeDialog);
  overlay.querySelector("#btn-link-cancel")?.addEventListener("click", closeDialog);

  // 1. 浏览选择本地物理文件
  overlay.querySelector("#btn-link-pick-file")?.addEventListener("click", async () => {
    try {
      const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
      if (invoke) {
        const res = await invoke("open_mindmap_file", {});
        if (res && res !== "CANCELLED" && res[0]) {
          inputEl.value = res[0];
          inputEl.focus();
        }
      }
    } catch {}
  });

  // 2. 选择已打开标签页
  overlay.querySelector("#sel-link-open-tab")?.addEventListener("change", (e) => {
    if (e.target.value) {
      inputEl.value = e.target.value;
      inputEl.focus();
    }
  });

  // 3. 选择当前导图节点
  overlay.querySelector("#sel-link-node")?.addEventListener("change", (e) => {
    if (e.target.value) {
      inputEl.value = e.target.value;
      inputEl.focus();
    }
  });

  // 4. 测试跳转
  overlay.querySelector("#btn-link-test-nav")?.addEventListener("click", () => {
    const val = inputEl.value.trim();
    if (val) navigateDeepLink(val);
  });

  // 5. 清除链接
  overlay.querySelector("#btn-link-clear")?.addEventListener("click", () => {
    inputEl.value = "";
    overlay.querySelector("#btn-link-save")?.click();
  });

  // 6. 保存链接
  overlay.querySelector("#btn-link-save")?.addEventListener("click", () => {
    const cleanVal = inputEl.value.trim() || null;
    const docCtx = getActiveDocumentContext();
    docCtx?.executeCommand({
      type: COMMANDS.UPDATE_ATTRS,
      nodeId: node.id,
      oldAttrs: { link: node.link || null },
      newAttrs: { link: cleanVal }
    });
    docCtx?.markLayoutDirty(node.id);
    bus.emit(EVENTS.RENDER_APP);
    closeDialog();
    showToast(cleanVal ? "🔗 跨文件/双链跳转已绑定" : "🔗 已移除链接");
  });

  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      overlay.querySelector("#btn-link-save")?.click();
    } else if (e.key === "Escape") {
      closeDialog();
    }
  });
}

/**
 * 校验画布点击是否命中了节点上的 🔗 胶囊微图标
 */
export function isClickOnNodeLink(node, clickWorldX, clickWorldY) {
  if (!node || !node.link) return false;
  const padX = Math.max(4, Math.round((node.width - (node.contentWidth || 0)) / 2));
  let currentOffset = padX;
  if (node.todo) currentOffset += 16;
  if (node.icon) currentOffset += 16;
  if (node.priority) currentOffset += 19;
  if (node.progress !== undefined && node.progress !== null && node.progress !== '') currentOffset += 15;
  if (node.note) currentOffset += 15;

  const linkBadgeLeft = node.x + currentOffset;
  const linkBadgeRight = linkBadgeLeft + 17;
  const centerY = node.y + node.height / 2;

  return clickWorldX >= linkBadgeLeft && clickWorldX <= linkBadgeRight &&
         clickWorldY >= centerY - 10 && clickWorldY <= centerY + 10;
}
