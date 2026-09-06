import { drawAppleSquircle } from "../geometry/squircle.js";
import { getDueDateStatus } from "../ui/due-date.js";
import { measureTextWidth, PRIORITY_COLORS, getActiveFontFamily } from "../geometry/layout.js";
import { state } from "../core/state.js";

export function drawNodeContent(ctx, node, level, isRootOfView, docCtx, currentScale = 1.0) {
  if (currentScale < 0.28 && !isRootOfView) return;

  const fontFam = getActiveFontFamily();
  const boxStyle = docCtx?.boxStyle || "squircle";
  const isGlobalDark = document.documentElement.getAttribute("data-theme") === "dark";
  const isDarkCanvas = isGlobalDark || ["space-gray", "midnight-abyss", "prussian-navy", "slate-chalkboard", "cyber-violet", "obsidian-coffee"].includes(docCtx?.canvasBgColor);

  const padX = Math.max(4, Math.round((node.width - (node.contentWidth || 0)) / 2));
  let currentOffset = padX;
  const centerY = node.y + node.height / 2;

  // 0.5 🌟 待办复选框 (18px 步进)
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
    currentOffset += 18;
  } else if (node.todo) {
    currentOffset += 18;
  }

  // 1. 图标 (紧凑对齐 18px 步进)
  if (node.icon && currentScale >= 0.45) {
    ctx.font = `13px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.icon, node.x + currentOffset + 7, centerY + 0.8);
    currentOffset += 18;
  } else if (node.icon) {
    currentOffset += 18;
  }

  // 2. 优先级 P1 ~ P4 (精巧微胶囊 20x14，21px 步进)
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
    currentOffset += 21;
  }

  // 3. 🌟 进度环多色阶高定渲染体系 (含 0% 未启动专属微靶心)
  const hasProgress = node.progress !== undefined && node.progress !== null && node.progress !== "";
  if (hasProgress) {
    if (currentScale >= 0.45) {
      const prgVal = parseInt(node.progress, 10) || 0;
      const prgX = node.x + currentOffset + 7;

      // 多色阶色彩映射
      const prgColor = prgVal <= 0 ? (isDarkCanvas ? "#94a3b8" : "#86868b")
                     : prgVal <= 25 ? "#0071e3"
                     : prgVal <= 50 ? "#ff9500"
                     : prgVal <= 75 ? "#af52de"
                     : prgVal < 100 ? "#30b0c7"
                     : "#34c759";

      // 外环轨道
      ctx.beginPath();
      ctx.arc(prgX, centerY, 5.2, 0, Math.PI * 2);
      ctx.strokeStyle = isDarkCanvas ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (prgVal === 0) {
        // 🌟 0% 特别设计：微靶心空心指示点，清晰表明已立项待动工
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

        // 100% 达成点亮中心绿实心成就核
        if (prgVal === 100) {
          ctx.beginPath();
          ctx.arc(prgX, centerY, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = "#34c759";
          ctx.fill();
        }
      }
    }
    currentOffset += 16;
  }

  // 4. 备注指示符 (17px 步进)
  if (node.note && currentScale >= 0.5) {
    ctx.font = `11.5px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📝", node.x + currentOffset + 6, centerY + 0.8);
    currentOffset += 17;
  } else if (node.note) {
    currentOffset += 17;
  }

  // 4.5 🌟 深度链接指示符 (17px 步进)
  if (node.link && currentScale >= 0.5) {
    ctx.font = `11.5px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔗", node.x + currentOffset + 6, centerY + 0.8);
    currentOffset += 17;
  } else if (node.link) {
    currentOffset += 17;
  }

  // 5. 核心文字（匹配侧边栏：字号、粗细、斜体、删除线与颜色）
  
  let defaultFill = "#1d1d1f";
  if (isDarkCanvas) {
    defaultFill = "#ffffff";
  } else if (boxStyle === "underline") {
    defaultFill = "#1d1d1f";
  } else if (isRootOfView || boxStyle === "solid") {
    defaultFill = "#ffffff";
  }

  const finalFill = node.textColor && node.textColor !== "default" ? node.textColor : defaultFill;
  const fontSize = node.fontSize ? parseFloat(node.fontSize) : (isRootOfView ? 18 : (level === 1 ? 14.5 : 13.5));
  const fontWeight = node.fontWeight || (isRootOfView ? "700" : (level === 1 ? "600" : "500"));
  const fontStyle = node.fontStyle || "normal";
  const hasStrikethrough = node.textDecoration === "line-through" || Boolean(node.done);

  ctx.fillStyle = finalFill;
  // 🌟 动态拼装 Canvas Font：支持 italic 与 normal
  ctx.font = `${fontStyle !== "normal" ? fontStyle + " " : ""}${fontWeight} ${fontSize}px ${fontFam}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = node.lines || String(node.text ?? "").split(/\r?\n/);
  const lineHeight = node.lineHeight || Math.round(fontSize * 1.35);
  const totalH = (lines.length - 1) * lineHeight;
  const textStartY = centerY - totalH / 2;
  const textCenterX = node.x + currentOffset + (node.textWidth || 0) / 2;

  const isRecall = Boolean(docCtx?.isRecallMode && !isRootOfView && !node._unmasked);
  const isEditing = Boolean(state.editingNodeId && state.editingNodeId === node.id);

  if (!isEditing) {
    if (isRecall) {
      // 🌟 彻底防窥：100% 物理阻断文字绘制，渲染高定 Apple 磨砂防窥胶囊
      const maskW = Math.max(34, (node.textWidth || 36) + 8);
      const maskH = Math.max(18, totalH + lineHeight - 3);
      const maskX = textCenterX - maskW / 2;
      const maskY = centerY - maskH / 2;

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
      ctx.fillText("•••", textCenterX, centerY + 0.5);
      ctx.restore();
    } else {
      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        const lineText = lines[lIdx];
        const curLineY = textStartY + lIdx * lineHeight;
        ctx.fillText(lineText, textCenterX, curLineY);

        // 🌟 绘制删除线（居中贯穿文字）
        if (hasStrikethrough) {
          ctx.save();
          const lineW = measureTextWidth(lineText, fontSize, fontWeight, fontStyle);
          ctx.strokeStyle = finalFill;
          ctx.lineWidth = Math.max(1.2, fontSize * 0.08);
          ctx.beginPath();
          ctx.moveTo(textCenterX - lineW / 2, curLineY + 0.5);
          ctx.lineTo(textCenterX + lineW / 2, curLineY + 0.5);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  currentOffset += node.textWidth;

  // 5.5 🌟 轻量截止日与倒计时胶囊 (自适应色彩变色)
  node._duePillRect = null;
  if (node.dueDate && currentScale >= 0.45) {
    const dueInfo = getDueDateStatus(node.dueDate, Boolean(node.done), isDarkCanvas);
    if (dueInfo) {
      currentOffset += 4;
      const pillW = measureTextWidth(dueInfo.label, 8.5, "600", "normal") + 11;
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

  // 6. 节点标签 (紧凑微胶囊对齐)
  if (node.tags && Array.isArray(node.tags) && node.tags.length > 0 && currentScale >= 0.55) {
    currentOffset += 5; // 紧贴文字
    for (let tIdx = 0; tIdx < node.tags.length; tIdx++) {
      const tagText = String(node.tags[tIdx]);
      const tagW = measureTextWidth(tagText, 9, "600", "normal") + 9;
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
  }
}
