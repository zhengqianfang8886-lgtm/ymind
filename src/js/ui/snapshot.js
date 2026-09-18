import { getActiveDocumentContext, findNode } from "../core/state.js";
import { ensureLayoutReady } from "../geometry/layout.js";
import { drawAppleSquircle } from "../geometry/squircle.js";
import { drawNodeContent } from "../render/node-drawer.js";
import { showToast, escapeHtml, sanitizeFilename } from "./dialog.js";
import { isDarkCanvasTheme } from "../data/palettes.js";

const THEME_PRESETS = {
  "studio-white": { bg: "#f8fafc", dot: "rgba(148, 163, 184, 0.32)", line: "rgba(148, 163, 184, 0.32)" },
  "warm-ivory": { bg: "#faf6ed", dot: "rgba(180, 132, 108, 0.28)", line: "rgba(180, 132, 108, 0.28)" },
  "vintage-parchment": { bg: "#f4eedb", dot: "rgba(166, 124, 82, 0.28)", line: "rgba(166, 124, 82, 0.28)" },
  "matcha-mist": { bg: "#f1f7f2", dot: "rgba(78, 135, 82, 0.28)", line: "rgba(78, 135, 82, 0.28)" },
  "lavender-fog": { bg: "#f7f4fb", dot: "rgba(157, 114, 196, 0.28)", line: "rgba(157, 114, 196, 0.28)" },
  "glacier-blue": { bg: "#f0f6fb", dot: "rgba(56, 142, 201, 0.28)", line: "rgba(56, 142, 201, 0.28)" },
  "morandi-stone": { bg: "#eeedf0", dot: "rgba(120, 136, 150, 0.28)", line: "rgba(120, 136, 150, 0.28)" },
  "sakura-blossom": { bg: "#fff5f5", dot: "rgba(244, 114, 182, 0.28)", line: "rgba(244, 114, 182, 0.28)" },
  "sand-dune": { bg: "#f7f3e8", dot: "rgba(194, 155, 100, 0.28)", line: "rgba(194, 155, 100, 0.28)" },
  "space-gray": { bg: "#181a1f", dot: "rgba(255, 255, 255, 0.24)", line: "rgba(255, 255, 255, 0.12)" },
  "midnight-abyss": { bg: "#09090b", dot: "rgba(255, 255, 255, 0.20)", line: "rgba(255, 255, 255, 0.10)" },
  "prussian-navy": { bg: "#0c1a2e", dot: "rgba(56, 189, 248, 0.32)", line: "rgba(56, 189, 248, 0.18)" },
  "slate-chalkboard": { bg: "#13241b", dot: "rgba(74, 222, 128, 0.30)", line: "rgba(74, 222, 128, 0.16)" },
  "cyber-violet": { bg: "#150e28", dot: "rgba(192, 132, 252, 0.32)", line: "rgba(192, 132, 252, 0.16)" },
  "obsidian-coffee": { bg: "#1c1614", dot: "rgba(217, 119, 6, 0.30)", line: "rgba(217, 119, 6, 0.16)" }
};

function createTexturePattern(ctx, patternType, theme) {
  if (!patternType || patternType === "none") return null;
  const pCanvas = document.createElement("canvas");
  const pctx = pCanvas.getContext("2d");
  if (!pctx) return null;

  if (patternType === "grid") {
    pCanvas.width = 20; pCanvas.height = 20;
    pctx.strokeStyle = theme.line; pctx.lineWidth = 1;
    pctx.strokeRect(0, 0, 20, 20);
  } else if (patternType === "cross") {
    pCanvas.width = 32; pCanvas.height = 32;
    pctx.strokeStyle = theme.line; pctx.lineWidth = 1;
    pctx.strokeRect(0, 0, 32, 32);
    pctx.fillStyle = theme.dot;
    pctx.beginPath(); pctx.arc(16, 16, 1.2, 0, Math.PI * 2); pctx.fill();
  } else if (patternType === "lined") {
    pCanvas.width = 28; pCanvas.height = 28;
    pctx.strokeStyle = theme.line; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.moveTo(0, 28); pctx.lineTo(28, 28); pctx.stroke();
  } else if (patternType === "stripes") {
    pCanvas.width = 24; pCanvas.height = 24;
    pctx.strokeStyle = theme.line; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.moveTo(0, 24); pctx.lineTo(24, 0); pctx.stroke();
  } else if (patternType === "blueprint") {
    pCanvas.width = 50; pCanvas.height = 50;
    pctx.strokeStyle = theme.line; pctx.lineWidth = 0.5;
    for (let i = 10; i < 50; i += 10) {
      pctx.beginPath(); pctx.moveTo(i, 0); pctx.lineTo(i, 50); pctx.stroke();
      pctx.beginPath(); pctx.moveTo(0, i); pctx.lineTo(50, i); pctx.stroke();
    }
    pctx.strokeStyle = theme.dot; pctx.lineWidth = 1;
    pctx.strokeRect(0, 0, 50, 50);
  } else {
    const size = patternType === "dots-dense" ? 14 : 24;
    pCanvas.width = size; pCanvas.height = size;
    pctx.fillStyle = theme.dot;
    pctx.beginPath(); pctx.arc(size / 2, size / 2, 1.1, 0, Math.PI * 2); pctx.fill();
  }
  return ctx.createPattern(pCanvas, "repeat");
}

function getSubtreeBounds(rootNode) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  function scan(n) {
    if (!n || typeof n.x !== "number" || isNaN(n.x)) return;
    const nw = n.width || 80;
    const nh = n.height || 36;
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + nw);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y + nh);
    if (n.children && !n.collapsed) {
      n.children.forEach(scan);
    }
  }
  scan(rootNode);
  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY) || maxX <= minX || maxY <= minY) {
    return { minX: 0, maxX: 260, minY: 0, maxY: 120, width: 260, height: 120 };
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function drawSnapBranchLines(ctx, node, boxStyle, lineStyle) {
  if (!node.children || node.collapsed || node.children.length === 0) return;
  for (const child of node.children) {
    if (typeof child.x !== "number" || typeof child.y !== "number") continue;
    const isDown = child.branchDirection === "down";
    const isLeft = child.branchDirection === "left";
    const isUnderline = boxStyle === "underline";

    let x1, y1, x2, y2;
    if (isDown) {
      x1 = node.x + (node.width || 80) / 2;
      y1 = node.y + (node.height || 36);
      x2 = child.x + (child.width || 80) / 2;
      y2 = child.y;
    } else if (isLeft) {
      x1 = node.x;
      x2 = child.x + (child.width || 80);
      y2 = isUnderline ? (child.y + (child.height || 36)) : (child.y + (child.height || 36) / 2);
      y1 = isUnderline ? (node.y + (node.height || 36)) : (node.y + (node.height || 36) / 2);
    } else {
      x1 = node.x + (node.width || 80);
      x2 = child.x;
      y2 = isUnderline ? (child.y + (child.height || 36)) : (child.y + (child.height || 36) / 2);
      y1 = isUnderline ? (node.y + (node.height || 36)) : (node.y + (node.height || 36) / 2);
    }

    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) continue;

    ctx.save();
    ctx.strokeStyle = child.colorTheme ? child.colorTheme.line : "#86868b";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (lineStyle === "straight") {
      ctx.lineTo(x2, y2);
    } else {
      if (isDown) {
        ctx.bezierCurveTo(x1, y1 + dy * 0.5, x2, y2 - dy * 0.5, x2, y2);
      } else {
        ctx.bezierCurveTo(x1 + dx * 0.5, y1, x2 - dx * 0.5, y2, x2, y2);
      }
    }
    ctx.stroke();
    ctx.restore();

    drawSnapBranchLines(ctx, child, boxStyle, lineStyle);
  }
}

function drawSnapBranchNodes(ctx, node, isRoot, docCtx) {
  if (typeof node.x !== "number" || typeof node.y !== "number") return;
  const nw = node.width || 80;
  const nh = node.height || 36;
  const boxStyle = docCtx.boxStyle || "squircle";
  const isGlobalDark = document.documentElement.getAttribute("data-theme") === "dark";
  const isDarkCanvas = isGlobalDark || isDarkCanvasTheme(docCtx.canvasBgColor);

  ctx.save();
  const r = isRoot ? 11 : 7;
  if (boxStyle !== "underline") {
    if (boxStyle === "rect") {
      ctx.beginPath();
      ctx.rect(node.x, node.y, nw, nh);
    } else {
      drawAppleSquircle(ctx, node.x, node.y, nw, nh, r);
    }
    if (isRoot) {
      const grad = ctx.createLinearGradient(node.x, node.y, node.x, node.y + nh);
      grad.addColorStop(0, "#0077ed");
      grad.addColorStop(1, "#005bb5");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
    } else if (boxStyle === "solid") {
      ctx.fillStyle = node.colorTheme ? (node.colorTheme.solid || node.colorTheme.border) : "#0071e3";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = isDarkCanvas ? "rgba(30, 36, 48, 0.96)" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = node.colorTheme ? node.colorTheme.border : "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(node.x, node.y + nh);
    ctx.lineTo(node.x + nw, node.y + nh);
    ctx.strokeStyle = node.colorTheme ? node.colorTheme.line : "#86868b";
    ctx.lineWidth = isRoot ? 2.8 : 2.2;
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  drawNodeContent(ctx, node, isRoot ? 0 : 1, isRoot, docCtx, 1.0);
  ctx.restore();

  if (node.children && !node.collapsed) {
    for (const child of node.children) {
      drawSnapBranchNodes(ctx, child, false, docCtx);
    }
  }
}

export function generateCodeSnapCanvas(targetNode = null) {
  const docCtx = getActiveDocumentContext();
  if (!docCtx || !docCtx.mindData) return null;

  const tab = docCtx.tab;
  if (tab) {
    try {
      ensureLayoutReady(tab, true);
    } catch (e) {
      console.warn("[Snapshot] ensureLayoutReady fallback:", e);
    }
  }

  // 🌟 核心：优先导出显式指定节点或当前选中的焦点分支节点；无选中时导出全图
  const root = targetNode || docCtx.primarySelectedNode || findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData;
  const bounds = getSubtreeBounds(root);

  const dpr = 2;
  const padding = 36; // 纯净留白，紧凑舒展

  const totalWidth = Math.max(200, Math.ceil(bounds.width + padding * 2));
  const totalHeight = Math.max(120, Math.ceil(bounds.height + padding * 2));

  const canvas = document.createElement("canvas");
  canvas.width = totalWidth * dpr;
  canvas.height = totalHeight * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const bgColorKey = docCtx.canvasBgColor || "studio-white";
  const bgPatternKey = docCtx.canvasBgPattern || "dots";
  const theme = THEME_PRESETS[bgColorKey] || THEME_PRESETS["studio-white"];

  // 1. 填充纯净画布真实底色（彻底去除外层流光背景与多余阴影）
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 2. 平铺绘制画布真实底纹（点阵/方格等）
  const pattern = createTexturePattern(ctx, bgPatternKey, theme);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, totalWidth, totalHeight);
  }

  // 3. 内容居中偏移并绘制完整脑图连线与节点
  const contentOffsetX = padding - bounds.minX;
  const contentOffsetY = padding - bounds.minY;

  ctx.save();
  ctx.translate(contentOffsetX, contentOffsetY);
  const isTargetRoot = root.id === (docCtx.focusedRootId || docCtx.mindData.id);
  drawSnapBranchLines(ctx, root, docCtx.boxStyle || "squircle", docCtx.lineStyle || "curve");
  drawSnapBranchNodes(ctx, root, isTargetRoot, docCtx);
  ctx.restore();

  return canvas;
}

export function openSnapshotModal(explicitNode = null) {
  const docCtx = getActiveDocumentContext();
  if (!docCtx || !docCtx.mindData) {
    showToast("⚠️ 当前没有可导出的思维导图");
    return;
  }
  if (docCtx.tab?.isEncrypted && docCtx.tab?._isLocked) {
    showToast("🔒 当前导图已锁定，请先输入密码解锁后再导出");
    return;
  }

  // 🌟 智能探测焦点节点：若用户选中了某个分支节点，优先提供分支导出通道
  const primaryNode = explicitNode || docCtx.primarySelectedNode || null;
  const fullRoot = findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData;
  const isSubNode = Boolean(primaryNode && primaryNode.id !== fullRoot.id);

  let currentScope = isSubNode ? "branch" : "full";

  let modal = document.getElementById("apple-snapshot-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "apple-snapshot-modal";
    modal.className = "apple-modal-overlay hidden";
    document.body.appendChild(modal);
  }

  function getActiveRoot() {
    return (currentScope === "branch" && primaryNode) ? primaryNode : fullRoot;
  }

  let currentCanvas = null;
  let currentDataUrl = "";
  let currentFilename = "";

  function renderSnapshotPreview() {
    const activeRoot = getActiveRoot();
    try {
      currentCanvas = generateCodeSnapCanvas(activeRoot);
    } catch (err) {
      console.error("[Snapshot Render Error]", err);
      showToast("⚠️ 生成快照时出错: " + (err?.message || "几何解析失败"));
      return false;
    }
    if (!currentCanvas) return false;

    currentDataUrl = currentCanvas.toDataURL("image/png");
    const rawTitle = (activeRoot?.text || docCtx?.tab?.title || "思维导图").trim();
    currentFilename = `${sanitizeFilename(rawTitle)}-snap.png`;
    return true;
  }

  if (!renderSnapshotPreview()) {
    showToast("⚠️ 当前无可导出的导图内容");
    return;
  }

  const subNodeText = isSubNode ? (primaryNode.text || "选中分支") : "";

  modal.innerHTML = `
    <div class="apple-modal-card" style="width: 720px; max-width: 95vw; max-height: 90vh; gap: 12px; display: flex; flex-direction: column;">
      <div class="apple-modal-header" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="modal-header-icon primary" style="font-size: 18px;">📸</div>
          <div class="modal-title-wrap">
            <h3 class="apple-modal-title">导出精美导图快照</h3>
            <span style="font-size: 11.5px; color: var(--text-tertiary);">画布底色与纹理还原 · 紧凑排版 · Retina 2x 高清渲染</span>
          </div>
        </div>
        <button id="btn-snap-close-x" class="inspector-close-btn" style="width: 28px; height: 28px;">✕</button>
      </div>

      ${isSubNode ? `
        <div style="display: flex; align-items: center; gap: 8px; padding: 2px 2px;">
          <span style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">导出范围:</span>
          <div class="segmented-style-row" style="width: auto; max-width: 360px; display: inline-flex;">
            <button id="snap-scope-branch" class="style-btn ${currentScope === 'branch' ? 'active' : ''}" style="padding: 4px 12px;">
              🎯 分支「${escapeHtml(subNodeText)}」
            </button>
            <button id="snap-scope-full" class="style-btn ${currentScope === 'full' ? 'active' : ''}" style="padding: 4px 12px;">
              🌐 完整导图全貌
            </button>
          </div>
        </div>
      ` : ''}

      <div class="apple-modal-body" style="flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: auto; background: rgba(0,0,0,0.03); border-radius: 14px; padding: 14px; border: 1px solid var(--border-subtle);">
        <img id="snap-preview-img" src="${currentDataUrl}" style="max-width: 100%; max-height: 52vh; border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,0.18); object-fit: contain;" alt="Snapshot Preview" />
      </div>

      <div class="apple-modal-footer" style="justify-content: space-between; margin-top: 4px;">
        <span id="snap-meta-size" style="font-size: 11.5px; color: var(--text-tertiary);">尺寸: ${currentCanvas.width / 2} × ${currentCanvas.height / 2} px (2x)</span>
        <div style="display: flex; gap: 10px;">
          <button id="btn-snap-cancel" class="modal-btn modal-btn-secondary">关闭</button>
          <button id="btn-snap-copy" class="modal-btn modal-btn-secondary" style="color: var(--apple-blue); font-weight: 600;">📋 复制图片</button>
          <button id="btn-snap-save" class="modal-btn modal-btn-primary">💾 保存图片</button>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");

  const closeModal = () => {
    modal.classList.add("hidden");
    modal.innerHTML = "";
  };

  modal.querySelector("#btn-snap-close-x")?.addEventListener("click", closeModal);
  modal.querySelector("#btn-snap-cancel")?.addEventListener("click", closeModal);

  function updateModalPreview() {
    const img = modal.querySelector("#snap-preview-img");
    const metaSize = modal.querySelector("#snap-meta-size");
    if (img) img.src = currentDataUrl;
    if (metaSize && currentCanvas) metaSize.innerText = `尺寸: ${currentCanvas.width / 2} × ${currentCanvas.height / 2} px (2x)`;
    modal.querySelector("#snap-scope-branch")?.classList.toggle("active", currentScope === "branch");
    modal.querySelector("#snap-scope-full")?.classList.toggle("active", currentScope === "full");
  }

  modal.querySelector("#snap-scope-branch")?.addEventListener("click", () => {
    if (currentScope !== "branch") {
      currentScope = "branch";
      if (renderSnapshotPreview()) updateModalPreview();
    }
  });

  modal.querySelector("#snap-scope-full")?.addEventListener("click", () => {
    if (currentScope !== "full") {
      currentScope = "full";
      if (renderSnapshotPreview()) updateModalPreview();
    }
  });

  // 1. 复制到系统剪贴板
  modal.querySelector("#btn-snap-copy")?.addEventListener("click", () => {
    if (!currentCanvas) return;
    currentCanvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          showToast("📋 已复制精美快照到剪贴板！");
          closeModal();
          return;
        }
      } catch (err) {
        console.warn("[Snapshot] Clipboard write failed:", err);
      }
      showToast("⚠️ 浏览器安全限制，请点击保存图片");
    }, "image/png");
  });

  // 2. 保存图片文件
  modal.querySelector("#btn-snap-save")?.addEventListener("click", () => {
    if (!currentDataUrl) return;
    const a = document.createElement("a");
    a.href = currentDataUrl;
    a.download = currentFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
    showToast(`💾 快照已保存: ${currentFilename}`);
    closeModal();
  });
}


