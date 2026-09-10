import { getActiveDocumentContext, findNode } from "../core/state.js";
import { ensureLayoutReady } from "../geometry/layout.js";
import { drawAppleSquircle } from "../geometry/squircle.js";
import { drawNodeContent } from "../render/node-drawer.js";
import { showToast, escapeHtml } from "./dialog.js";

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
  const isDarkCanvas = isGlobalDark || ["space-gray", "midnight-abyss", "prussian-navy", "slate-chalkboard", "cyber-violet", "obsidian-coffee"].includes(docCtx.canvasBgColor);

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

  // 🌟 核心防御：导出前无条件全量重排，确保所有节点几何绝对就绪
  const tab = docCtx.tab;
  if (tab) {
    try {
      ensureLayoutReady(tab, true);
    } catch (e) {
      console.warn("[Snapshot] ensureLayoutReady fallback:", e);
    }
  }

  const root = targetNode || docCtx.primarySelectedNode || findNode(docCtx.focusedRootId, docCtx.mindData) || docCtx.mindData;
  const bounds = getSubtreeBounds(root);

  const dpr = 2;
  const paddingOuter = 26;
  const paddingInner = 24;

  const cardWidth = Math.max(160, Math.ceil(bounds.width + paddingInner * 2));
  const cardHeight = Math.max(100, Math.ceil(bounds.height + paddingInner * 2));

  const totalWidth = cardWidth + paddingOuter * 2;
  const totalHeight = cardHeight + paddingOuter * 2;

  const canvas = document.createElement("canvas");
  canvas.width = totalWidth * dpr;
  canvas.height = totalHeight * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const bgColorKey = docCtx.canvasBgColor || "studio-white";
  const bgPatternKey = docCtx.canvasBgPattern || "dots";
  const theme = THEME_PRESETS[bgColorKey] || THEME_PRESETS["studio-white"];
  const isDarkCanvas = ["space-gray", "midnight-abyss", "prussian-navy", "slate-chalkboard", "cyber-violet", "obsidian-coffee"].includes(bgColorKey);

  // 1. 自适应柔光渐变外衬底
  const bgGrad = ctx.createLinearGradient(0, 0, totalWidth, totalHeight);
  if (isDarkCanvas) {
    bgGrad.addColorStop(0, "#1c222b");
    bgGrad.addColorStop(0.5, "#12161f");
    bgGrad.addColorStop(1, "#0a0c10");
  } else {
    bgGrad.addColorStop(0, "#7f7fd5");
    bgGrad.addColorStop(0.5, "#86a8e7");
    bgGrad.addColorStop(1, "#91eae4");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 2. 主卡片大阴影与当前画布真实底色
  const cardX = paddingOuter;
  const cardY = paddingOuter;

  ctx.save();
  ctx.shadowColor = isDarkCanvas ? "rgba(0, 0, 0, 0.65)" : "rgba(15, 23, 42, 0.28)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;

  ctx.fillStyle = theme.bg;
  drawAppleSquircle(ctx, cardX, cardY, cardWidth, cardHeight, 14);
  ctx.fill();
  ctx.restore();

  // 3. 绘制画布真实底纹纹理
  ctx.save();
  drawAppleSquircle(ctx, cardX, cardY, cardWidth, cardHeight, 14);
  ctx.clip();
  const pattern = createTexturePattern(ctx, bgPatternKey, theme);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
  }
  ctx.restore();

  // 卡片内嵌高光微边框
  ctx.save();
  ctx.strokeStyle = isDarkCanvas ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 1;
  drawAppleSquircle(ctx, cardX, cardY, cardWidth, cardHeight, 14);
  ctx.stroke();
  ctx.restore();

  // 4. 紧凑排版：无标题栏、无圆点、无水印
  const contentOffsetX = cardX + paddingInner - bounds.minX;
  const contentOffsetY = cardY + paddingInner - bounds.minY;

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

  let canvas = null;
  try {
    canvas = generateCodeSnapCanvas(explicitNode);
  } catch (err) {
    console.error("[Snapshot Render Error]", err);
    showToast("⚠️ 生成快照时出错: " + (err?.message || "几何解析失败"));
    return;
  }

  if (!canvas) {
    showToast("⚠️ 当前无可导出的导图内容");
    return;
  }

  let modal = document.getElementById("apple-snapshot-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "apple-snapshot-modal";
    modal.className = "apple-modal-overlay hidden";
    document.body.appendChild(modal);
  }

  const dataUrl = canvas.toDataURL("image/png");
  const fileTitle = (explicitNode?.text || docCtx?.tab?.title || "思维导图").trim();
  const safeFilename = `${fileTitle}-snap.png`;

  modal.innerHTML = `
    <div class="apple-modal-card" style="width: 720px; max-width: 95vw; max-height: 90vh; gap: 14px; display: flex; flex-direction: column;">
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

      <div class="apple-modal-body" style="flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: auto; background: rgba(0,0,0,0.03); border-radius: 14px; padding: 14px; border: 1px solid var(--border-subtle);">
        <img src="${dataUrl}" style="max-width: 100%; max-height: 52vh; border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,0.18); object-fit: contain;" alt="Snapshot Preview" />
      </div>

      <div class="apple-modal-footer" style="justify-content: space-between; margin-top: 4px;">
        <span style="font-size: 11.5px; color: var(--text-tertiary);">尺寸: ${canvas.width / 2} × ${canvas.height / 2} px (2x)</span>
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

  // 1. 复制到系统剪贴板
  modal.querySelector("#btn-snap-copy")?.addEventListener("click", () => {
    canvas.toBlob(async (blob) => {
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
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
    showToast(`💾 快照已保存: ${safeFilename}`);
    closeModal();
  });
}

// 🌟 全局事件委托兜底保障：确保任意时序点击均能响应
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (e.target.closest("#btn-export-snap")) {
      e.preventDefault();
      openSnapshotModal();
    }
  });
}
