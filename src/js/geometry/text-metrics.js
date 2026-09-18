import { getActiveFontFamily, getTextLineWidth, wrapTextLines, getEffectiveNodeTypography, MAX_ROOT_TEXT_WIDTH, MAX_NODE_TEXT_WIDTH } from "./layout.js";

/**
 * 🌟 权威单一事实来源：统一计算节点文本的世界坐标、基线位置与视口屏幕投影
 * 核心数学突破：引入与 CSS Inline Box 完全一致的 Half-Leading 对齐，
 * 使 Canvas fillText 基线与 HTML Textarea 第一行文字基线 100% 绝对重合，杜绝进入编辑时的上下跳动。
 */
export function getNodeTextGeometry(node, scale = 1.0, camera = { x: 0, y: 0 }, customDocCtx = null) {
  if (!node) return null;

  const isRoot = customDocCtx ? (node.id === customDocCtx.focusedRootId) : (node.id === "root");
  const level = isRoot ? 0 : (node._level !== undefined ? node._level : (node.branchDirection ? 1 : 2));
  const typo = getEffectiveNodeTypography(node, level, customDocCtx?.focusedRootId, customDocCtx);
  const fontSize = typo.fontSize;
  const lineHeight = node.lineHeight || Math.round(fontSize * 1.36);
  const fontFam = typo.fontFamily || getActiveFontFamily();

  const maxAllowedW = isRoot ? MAX_ROOT_TEXT_WIDTH : MAX_NODE_TEXT_WIDTH;
  const lines = node.lines || wrapTextLines(node.text, fontSize, maxAllowedW);

  // 1. 计算文本世界尺寸 (带入真实字重)
  let maxLW = 0;
  for (let i = 0; i < lines.length; i++) {
    const lw = getTextLineWidth(lines[i], fontSize, typo.fontWeight, typo.fontStyle);
    if (lw > maxLW) maxLW = lw;
  }
  const textWidth = Math.max(12, maxLW);
  // 单行文本高度按整行行盒计算，多行按行距累加
  const totalTextH = lines.length * lineHeight;

  // 2. 计算文本在节点内的世界起始坐标 (左对齐，垂直居中)
  const padX = Math.max(6, Math.round((node.width - (node.contentWidth || 0)) / 2));
  const extraLeft = node.extraLeftWidth || 0;
  const worldTextX = node.x + padX + extraLeft;

  const centerY = node.y + node.height / 2;
  const worldTextY = centerY - totalTextH / 2;

  // 3. 严格基线锁定 (Alphabetic Baseline Lock + Half-Leading Alignment)
  // 必须加入 (lineHeight - fontSize) / 2，使 Canvas 与 Textarea 的基线高度处于完全相同的数学平面
  const halfLeading = (lineHeight - fontSize) / 2;
  const ascent = fontSize * 0.84;
  const firstLineBaseline = worldTextY + halfLeading + ascent;

  // 4. 视口屏幕坐标投影 (CSS px)
  const screenX = worldTextX * scale + camera.x;
  const screenY = worldTextY * scale + camera.y;
  const screenWidth = textWidth * scale;
  const screenHeight = totalTextH * scale;
  const screenLineHeight = lineHeight * scale;
  const screenFontSize = fontSize * scale;

  return {
    typography: {
      fontSize,
      lineHeight,
      fontWeight: typo.fontWeight,
      fontStyle: typo.fontStyle,
      fontFamily: fontFam,
      color: node.textColor && node.textColor !== "default" ? node.textColor : null
    },
    world: {
      x: worldTextX,
      y: worldTextY,
      width: textWidth,
      height: totalTextH,
      firstLineBaseline,
      lineHeight,
      lines
    },
    screen: {
      x: screenX,
      y: screenY,
      width: screenWidth,
      height: screenHeight,
      lineHeight: screenLineHeight,
      fontSize: screenFontSize
    }
  };
}
