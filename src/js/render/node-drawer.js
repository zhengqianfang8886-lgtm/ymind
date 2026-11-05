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

  // 0.2 🌟 子节点有序列表编号徽章 (1, 2, 3...)
  if (node._orderNumber && currentScale >= 0.42) {
    const numStr = String(node._orderNumber);
    const numW = Math.max(15, measureTextWidth(numStr, 9, "700", "normal", false) + 8);
    const badgeX = node.x + currentOffset;
    const badgeY = centerY - 7;
    ctx.beginPath();
    drawAppleSquircle(ctx, badgeX, badgeY, numW, 14, 3.5);
    ctx.fillStyle = isDarkCanvas ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 113, 227, 0.09)";
    ctx.fill();
    ctx.strokeStyle = isDarkCanvas ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 113, 227, 0.24)";
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.fillStyle = isDarkCanvas ? "#93c5fd" : "#0071e3";
    ctx.font = `bold 9px ${fontFam}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(numStr, badgeX + numW / 2, centerY + 0.2);

    currentOffset += (numW + 4);
    hasAnyBadge = true;
  } else if (node._orderNumber) {
    const numStr = String(node._orderNumber);
    currentOffset += Math.max(15, numStr.length * 7 + 8) + 4;
    hasAnyBadge = true;
  }

              // 0.5 🌟 待办复选框 (标准 Apple 风格，纯静态高响应)
  node._checkboxRect = null;
  if ((node.todo || node.done) && currentScale >= 0.45) {
    const boxSize = 14;
    const boxX = node.x + currentOffset;
    const boxY = centerY - boxSize / 2;
    const radius = boxSize / 2;
    const centerX = boxX + radius;
    const centerYPos = boxY + radius;
    const shape = docCtx?.tab?.todoCheckboxStyle || (typeof getGlobalSettings === "function" ? getGlobalSettings().todoCheckboxStyle : null) || "circle";

    node._checkboxRect = { x: boxX, y: boxY, width: boxSize, height: boxSize };

    const globalCfg = typeof getGlobalSettings === "function" ? getGlobalSettings() : {};
    const todoAccentPref = globalCfg.todoCompletedColor || "blue";
    const doneColor = todoAccentPref === "green" ? "#34c759" : "#0071e3";
    const doneBorder = todoAccentPref === "green" ? "rgba(52, 199, 89, 0.35)" : "rgba(0, 113, 227, 0.35)";

    ctx.save();
    if (node.done) {
      ctx.beginPath();
      if (shape === "squircle") {
        drawAppleSquircle(ctx, boxX, boxY, boxSize, boxSize, 3.5);
      } else {
        ctx.arc(centerX, centerYPos, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = doneColor;
      ctx.fill();

      ctx.strokeStyle = doneBorder;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // 白色清晰矢量对勾
      ctx.beginPath();
      ctx.moveTo(boxX + 3.8, boxY + 7.0);
      ctx.lineTo(boxX + 5.9, boxY + 9.6);
      ctx.lineTo(boxX + 10.4, boxY + 4.4);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    } else {
      ctx.beginPath();
      if (shape === "squircle") {
        drawAppleSquircle(ctx, boxX + 0.5, boxY + 0.5, boxSize - 1, boxSize - 1, 3.2);
      } else {
        ctx.arc(centerX, centerYPos, radius - 0.7, 0, Math.PI * 2);
      }
      ctx.fillStyle = isDarkCanvas ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)";
      ctx.fill();

      ctx.strokeStyle = isDarkCanvas ? "rgba(255, 255, 255, 0.32)" : "rgba(0, 0, 0, 0.22)";
      ctx.lineWidth = 1.35;
      ctx.stroke();
    }
    ctx.restore();
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

    // 3. 🌟 进度环与 4/4 胶囊 (自适应实色/根节点深色高对比度反白)
  const hasProgress = node.progress !== undefined && node.progress !== null && node.progress !== "";
  if (hasProgress) {
    const prgStr = String(node.progress).trim();
    let prgVal = 0;
    let countBadge = "";

    if (prgStr.includes("/")) {
      countBadge = prgStr;
      const parts = countBadge.split("/").map(n => parseInt(n, 10));
      const doneN = parts[0] || 0;
      const totalN = parts[1] || 1;
      prgVal = totalN > 0 ? Math.round((doneN / totalN) * 100) : 0;
      if (doneN >= totalN && totalN > 0) prgVal = 100;
    } else {
      prgVal = parseInt(prgStr, 10) || 0;
    }

    if (currentScale >= 0.45) {
      const prgX = node.x + currentOffset + 8;
      const globalCfg = typeof getGlobalSettings === "function" ? getGlobalSettings() : {};
      const completedColorChoice = (globalCfg.todoCompletedColor === "green") ? "#34c759" : "#0071e3";

      // 🌟 判断当前卡片是否属于实色深底（根节点深蓝底或 solid 模式）
      const isFilledDarkNode = isRootOfView || (boxStyle === "solid");

      let prgColor = "";
      if (isFilledDarkNode) {
        // 深色背景卡片上的进度色相：普通进度与全满均使用亮白/亮绿，确保绝对清晰！
        prgColor = (prgVal >= 100)
          ? ((completedColorChoice === "#34c759") ? "#4ade80" : "#ffffff")
          : "#ffffff";
      } else {
        prgColor = prgVal <= 0 ? (isDarkCanvas ? "#94a3b8" : "#86868b")
                 : prgVal <= 25 ? "#0071e3"
                 : prgVal <= 50 ? "#ff9500"
                 : prgVal <= 75 ? "#af52de"
                 : prgVal < 100 ? "#30b0c7"
                 : completedColorChoice;
      }

      // 底槽环颜色适配
      ctx.beginPath();
      ctx.arc(prgX, centerY, 5.2, 0, Math.PI * 2);
      ctx.strokeStyle = isFilledDarkNode ? "rgba(255, 255, 255, 0.35)" : (isDarkCanvas ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.1)");
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (prgVal === 0) {
        ctx.beginPath();
        ctx.arc(prgX, centerY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = prgColor;
        ctx.fill();
      } else if (prgVal >= 100) {
        // 满额完整圆环与实心圆心
        ctx.beginPath();
        ctx.arc(prgX, centerY, 5.2, 0, Math.PI * 2);
        ctx.strokeStyle = prgColor;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(prgX, centerY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = prgColor;
        ctx.fill();
      } else {
        const angle = (prgVal / 100) * (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(prgX, centerY, 5.2, -Math.PI / 2, -Math.PI / 2 + angle);
        ctx.strokeStyle = prgColor;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      currentOffset += 18;

      // 🌟 绘制 4/4 胶囊：在深色根节点卡片上采用柔光半透白底 + 高亮纯白粗体！
      if (countBadge && currentScale >= 0.5) {
        const textW = measureTextWidth(countBadge, 8.5, "700", "normal", false);
        const pillW = textW + 9;
        const pillH = 13.5;
        const pillX = node.x + currentOffset;
        const pillY = centerY - 6.75;

        let pillBg, pillBorder, pillText;
        if (isFilledDarkNode) {
          pillBg = "rgba(255, 255, 255, 0.20)";
          pillBorder = "rgba(255, 255, 255, 0.40)";
          pillText = "#ffffff";
        } else {
          pillText = prgColor;
          if (prgVal >= 100) {
            pillBg = (completedColorChoice === "#34c759")
              ? (isDarkCanvas ? "rgba(52, 199, 89, 0.22)" : "rgba(52, 199, 89, 0.12)")
              : (isDarkCanvas ? "rgba(0, 113, 227, 0.22)" : "rgba(0, 113, 227, 0.12)");
            pillBorder = (completedColorChoice === "#34c759")
              ? "rgba(52, 199, 89, 0.35)"
              : "rgba(0, 113, 227, 0.35)";
          } else if (prgVal === 0) {
            pillBg = isDarkCanvas ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
            pillBorder = isDarkCanvas ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.10)";
            pillText = isDarkCanvas ? "#94a3b8" : "#86868b";
          } else if (prgColor === "#ff9500") {
            pillBg = isDarkCanvas ? "rgba(255, 149, 0, 0.18)" : "rgba(255, 149, 0, 0.09)";
            pillBorder = isDarkCanvas ? "rgba(255, 149, 0, 0.35)" : "rgba(255, 149, 0, 0.25)";
          } else {
            pillBg = isDarkCanvas ? "rgba(0, 113, 227, 0.18)" : "rgba(0, 113, 227, 0.09)";
            pillBorder = isDarkCanvas ? "rgba(0, 113, 227, 0.35)" : "rgba(0, 113, 227, 0.25)";
          }
        }

        ctx.beginPath();
        drawAppleSquircle(ctx, pillX, pillY, pillW, pillH, 3.5);
        ctx.fillStyle = pillBg;
        ctx.fill();
        ctx.strokeStyle = pillBorder;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = pillText;
        ctx.font = `bold 8.5px ${fontFam}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // 🌟 光学中心校准：向上补偿 0.65px，消除西文下延部空白导致的下坠感
        ctx.fillText(countBadge, pillX + pillW / 2, pillY + pillH / 2 - 0.65);

        currentOffset += (pillW + 4);
      }
    } else {
      currentOffset += 18;
    }
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

  // 🌟 核心防重叠锚定：文字起点绝对跟随左侧实际徽章 offset 累加值，彻底杜绝图标与文本撞车！
  const actualTextStartX = node.x + currentOffset;

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
      const maskX = actualTextStartX;
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
        ctx.fillText(lineText, actualTextStartX, lineBaselineY);

        if (hasStrikethrough) {
          ctx.save();
          const lineW = measureTextWidth(lineText, typo.fontSize, typo.fontWeight, typo.fontStyle);
          ctx.strokeStyle = finalFill;
          ctx.lineWidth = Math.max(1.4, typo.fontSize * 0.08);
          ctx.beginPath();
          const strikeY = lineBaselineY - typo.fontSize * 0.3;
          ctx.moveTo(actualTextStartX, strikeY);
          ctx.lineTo(actualTextStartX + lineW, strikeY);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // 权威定位：后缀区域严格锚定在文本真实绘制终点
  currentOffset += textGeo.world.width;

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
