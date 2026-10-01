import { getDurationBadgeStyle } from "../ui/task-duration.js";
import { drawAppleSquircle } from "../geometry/squircle.js";
import { getNodeTextGeometry } from "../geometry/text-metrics.js";
import { getDueDateStatus } from "../ui/due-date.js";
import { measureTextWidth, PRIORITY_COLORS, getActiveFontFamily, getEffectiveNodeTypography } from "../geometry/layout.js";
import { state } from "../core/state.js";
import { isDarkCanvasTheme } from "../data/palettes.js";

export function drawNodeContent(ctx, node, level, isRootOfView, docCtx, currentScale = 1.0) {
  if (currentScale < 0.28 && !isRootOfView) return;

  const fontFam = getActiveFontFamily();
  const boxStyle = docCtx?.boxStyle || "squircle";
  const isGlobalDark = document.documentElement.getAttribute("data-theme") === "dark";
  const isDarkCanvas = isGlobalDark || isDarkCanvasTheme(docCtx?.canvasBgColor);

  const padX = Math.max(6, Math.round((node.width - (node.contentWidth || 0)) / 2));
  let currentOffset = padX;
  const centerY = node.y + node.height / 2;
  let hasAnyBadge = false;

  // 0.5 🌟 待办复选框
  if (node.todo && currentScale >= 0.45) {
    const boxX = node.x + currentOffset;
    const boxY = centerY - 7;
    ctx.beginPath();
    drawAppleSquircle(ctx, boxX, boxY, 14, 14, 3.5);

    if (node.done) {
      ctx.fillStyle = "#34c759";
      ctx.fill();
      ctx.strokeStyle = "#28a745";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 10px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✓", boxX + 7, centerY);
    } else {
      ctx.fillStyle = isDarkCanvas ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)";
      ctx.fill();
      ctx.strokeStyle = isDarkCanvas ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.22)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    currentOffset += 20;
    hasAnyBadge = true;
  } else if (node.todo) {
    currentOffset += 20;
    hasAnyBadge = true;
  }

  // 1. 图标
  if (node.icon && currentScale >= 0.45) {
    ctx.font = `13px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.icon, node.x + currentOffset + 8, centerY + 0.8);
    currentOffset += 20;
    hasAnyBadge = true;
  } else if (node.icon) {
    currentOffset += 20;
    hasAnyBadge = true;
  }

  // 2. 优先级 P1 ~ P4
  if (node.priority && PRIORITY_COLORS[node.priority]) {
    if (currentScale >= 0.4) {
      const pColor = PRIORITY_COLORS[node.priority].bg;
      ctx.beginPath();
      drawAppleSquircle(ctx, node.x + currentOffset, centerY - 7, 20, 14, 3.5);
      ctx.fillStyle = pColor;
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 9px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.priority, node.x + currentOffset + 10, centerY + 0.2);
    }
    currentOffset += 23;
    hasAnyBadge = true;
  }

  // 3. 🌟 进度环多色阶高定渲染体系
  const hasProgress = node.progress !== undefined && node.progress !== null && node.progress !== "";
  if (hasProgress) {
    if (currentScale >= 0.45) {
      const prgVal = parseInt(node.progress, 10) || 0;
      const prgX = node.x + currentOffset + 8;

      const prgColor = prgVal <= 0 ? (isDarkCanvas ? "#94a3b8" : "#86868b")
                     : prgVal <= 25 ? "#0071e3"
                     : prgVal <= 50 ? "#ff9500"
                     : prgVal <= 75 ? "#af52de"
                     : prgVal < 100 ? "#30b0c7"
                     : "#34c759";

      ctx.beginPath();
      ctx.arc(prgX, centerY, 5.2, 0, Math.PI * 2);
      ctx.strokeStyle = isDarkCanvas ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (prgVal === 0) {
        ctx.beginPath();
        ctx.arc(prgX, centerY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = prgColor;
        ctx.fill();
      } else {
        const angle = (Math.min(100, Math.max(0, prgVal)) / 100) * (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(prgX, centerY, 5.2, -Math.PI / 2, -Math.PI / 2 + angle);
        ctx.strokeStyle = prgColor;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.stroke();

        if (prgVal === 100) {
          ctx.beginPath();
          ctx.arc(prgX, centerY, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = "#34c759";
          ctx.fill();
        }
      }
    }
    currentOffset += 18;
    hasAnyBadge = true;
  }



  if (hasAnyBadge) currentOffset += 6; // 徽章与首字呼吸缓冲间隙

  // 5. 🌟 核心文字：基于 text-metrics 权威几何模型绘制 (Baseline Lock)
  let defaultFill = "#1d1d1f";
  if (isDarkCanvas) {
    defaultFill = "#ffffff";
  } else if (boxStyle === "underline") {
    defaultFill = "#1d1d1f";
  } else if (isRootOfView || boxStyle === "solid") {
    defaultFill = "#ffffff";
  }

  const textGeo = getNodeTextGeometry(node, currentScale, { x: 0, y: 0 }, docCtx);
  const finalFill = textGeo.typography.color || defaultFill;
  const typo = textGeo.typography;
  const hasStrikethrough = (node.textDecoration === "line-through") || Boolean(node.done);

  ctx.fillStyle = finalFill;
  ctx.font = `${typo.fontStyle !== "normal" ? typo.fontStyle + " " : ""}${typo.fontWeight} ${typo.fontSize}px ${typo.fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const isRecall = Boolean(docCtx?.isRecallMode && !isRootOfView && !node._unmasked);
  const isEditing = Boolean(state.editingNodeId && state.editingNodeId === node.id);

  if (!isEditing) {
    if (isRecall) {
      const maskW = Math.max(34, textGeo.world.width + 10);
      const maskH = Math.max(18, textGeo.world.height + 4);
      const maskX = textGeo.world.x;
      const maskY = textGeo.world.y;

      ctx.save();
      ctx.beginPath();
      drawAppleSquircle(ctx, maskX, maskY, maskW, maskH, 5);

      if (isDarkCanvas) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#94a3b8";
      } else {
        ctx.fillStyle = "rgba(0, 113, 227, 0.10)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 113, 227, 0.24)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#0071e3";
      }

      ctx.font = `bold 11px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("•••", maskX + maskW / 2, maskY + maskH / 2 + 0.5);
      ctx.restore();
    } else {
      for (let lIdx = 0; lIdx < textGeo.world.lines.length; lIdx++) {
        const lineText = textGeo.world.lines[lIdx];
        const lineBaselineY = textGeo.world.firstLineBaseline + lIdx * textGeo.world.lineHeight;
        ctx.fillText(lineText, textGeo.world.x, lineBaselineY);

        if (hasStrikethrough) {
          ctx.save();
          const lineW = measureTextWidth(lineText, typo.fontSize, typo.fontWeight, typo.fontStyle);
          ctx.strokeStyle = finalFill;
          ctx.lineWidth = Math.max(1.4, typo.fontSize * 0.08);
          ctx.beginPath();
          const strikeY = lineBaselineY - typo.fontSize * 0.3;
          ctx.moveTo(textGeo.world.x, strikeY);
          ctx.lineTo(textGeo.world.x + lineW, strikeY);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // 权威定位：后缀区域严格锚定在文本真实绘制终点，杜绝任何压字
  currentOffset = (textGeo.world.x - node.x) + textGeo.world.width;

  // 5.1 🌟 后置线索指示符：备注 📝 与 深度链接 🔗
  node._noteRect = null;
  if (node.note && currentScale >= 0.5) {
    currentOffset += 4;
    const noteX = node.x + currentOffset;
    const noteY = centerY - 7;
    node._noteRect = { x: noteX, y: noteY, width: 15, height: 14 };
    ctx.font = `11px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📝", noteX + 7.5, centerY + 0.5);
    currentOffset += 16;
  }

  node._linkRect = null;
  if (node.link && currentScale >= 0.5) {
    currentOffset += 3;
    const linkX = node.x + currentOffset;
    const linkY = centerY - 7;
    node._linkRect = { x: linkX, y: linkY, width: 15, height: 14 };
    ctx.font = `11px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔗", linkX + 7.5, centerY + 0.5);
    currentOffset += 16;
  }

  // 5.5 🌟 轻量截止日与倒计时胶囊 (自适应色彩变色)
  node._duePillRect = null;
  if (node.dueDate && currentScale >= 0.45) {
    const dueInfo = getDueDateStatus(node.dueDate, Boolean(node.done), isDarkCanvas);
    if (dueInfo) {
      currentOffset += 4;
      const pillW = measureTextWidth(dueInfo.label, 8.5, "600", "normal", false) + 12;
      const pillH = 13;
      const pillX = node.x + currentOffset;
      const pillY = centerY - 6.5;

      node._duePillRect = { x: pillX, y: pillY, width: pillW, height: pillH };

      ctx.beginPath();
      drawAppleSquircle(ctx, pillX, pillY, pillW, pillH, 3.5);
      ctx.fillStyle = dueInfo.bg;
      ctx.fill();
      ctx.strokeStyle = dueInfo.border;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.fillStyle = dueInfo.color;
      ctx.font = `600 8.5px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(dueInfo.label, pillX + pillW / 2, centerY + 0.2);

      currentOffset += pillW + 1;
    }
  }

  // 5.6 🌟 任务耗时微胶囊 (Apple Indigo 风格)
  node._durationPillRect = null;
  if (node.duration && currentScale >= 0.45) {
    const durStyle = getDurationBadgeStyle(node.duration, Boolean(node.done), isDarkCanvas);
    if (durStyle) {
      currentOffset += 4;
      const pillW = measureTextWidth(durStyle.label, 8.5, "600", "normal", false) + 12;
      const pillH = 13;
      const pillX = node.x + currentOffset;
      const pillY = centerY - 6.5;

      node._durationPillRect = { x: pillX, y: pillY, width: pillW, height: pillH };

      ctx.beginPath();
      drawAppleSquircle(ctx, pillX, pillY, pillW, pillH, 3.5);
      ctx.fillStyle = durStyle.bg;
      ctx.fill();
      ctx.strokeStyle = durStyle.border;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.fillStyle = durStyle.color;
      ctx.font = `600 8.5px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(durStyle.label, pillX + pillW / 2, centerY + 0.2);

      currentOffset += pillW + 1;
    }
  }

  // 6. 节点标签 (舒展独立微胶囊)
  if (node.tags && Array.isArray(node.tags) && node.tags.length > 0 && currentScale >= 0.55) {
    currentOffset += 8; // 正文与标签舒展间隙
    for (let tIdx = 0; tIdx < node.tags.length; tIdx++) {
      const tagText = String(node.tags[tIdx]);
      const tagW = measureTextWidth(tagText, 9, "600", "normal") + 10;
      ctx.beginPath();
      drawAppleSquircle(ctx, node.x + currentOffset, centerY - 6.5, tagW, 13, 3.5);
      ctx.fillStyle = boxStyle === "solid" ? "rgba(255,255,255,0.2)" : (isDarkCanvas ? "rgba(255,255,255,0.1)" : "#f1f5f9");
      ctx.fill();
      ctx.strokeStyle = boxStyle === "solid" ? "rgba(255,255,255,0.3)" : (isDarkCanvas ? "rgba(255,255,255,0.15)" : "#e2e8f0");
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.fillStyle = (boxStyle === "solid" || isDarkCanvas) ? "#ffffff" : "#475569";
      ctx.font = `600 9px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tagText, node.x + currentOffset + tagW / 2, centerY + 0.2);
      currentOffset += tagW + 3;
    }
  }

  // 7. 折叠徽章
  if (node.children && node.children.length > 0 && !isRootOfView) {
    const badgeX = (node.branchDirection === "left") ? node.x : (node.x + node.width);
    
    if (!state.isInteracting && currentScale >= 0.5) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
    }

    ctx.save();
    ctx.globalAlpha = 1.0;

    ctx.beginPath();
    ctx.arc(badgeX, centerY, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = isDarkCanvas ? "#1e293b" : "#ffffff";
    ctx.fill();

    if (!state.isInteracting && currentScale >= 0.5) {
      ctx.restore();
    }

    ctx.strokeStyle = node.colorTheme ? node.colorTheme.badge : "#86868b";
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.fillStyle = node.colorTheme ? node.colorTheme.badge : "#86868b";
    ctx.font = `bold 9.5px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.collapsed ? String(node.children.length) : "−", badgeX, centerY + 0.4);
    ctx.restore();
  }
}
