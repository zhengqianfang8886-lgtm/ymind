import { COLOR_PALETTES, PRIORITY_COLORS } from "../data/palettes.js";
import { getGlobalSettings } from "../core/config.js";
import { bus, EVENTS } from "../core/event-bus.js";
import { getAncestors } from "../core/tree-utils.js";

export { PRIORITY_COLORS };

export const SPACING_CONFIG = {
  compact: { hGap: 34, vGap: 10 },
  normal: { hGap: 46, vGap: 14 },
  loose: { hGap: 68, vGap: 22 }
};

export const MAX_NODE_TEXT_WIDTH = 520;
export const MAX_ROOT_TEXT_WIDTH = 640;

export function wrapTextLines(text, fontSize, maxWidth) {
  const raw = String(text ?? "");
  if (!raw) return [""];
  const paragraphs = raw.split(/\r?\n/);
  const resultLines = [];

  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p];
    if (!para) {
      resultLines.push("");
      continue;
    }
    if (getTextLineWidth(para, fontSize) <= maxWidth) {
      resultLines.push(para);
      continue;
    }

    const tokens = para.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_\-]+|\s+|[^\s\w\u4e00-\u9fa5]/g) || [para];
    let curLine = "";
    let curWidth = 0;

    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t];
      const tokenW = getTextLineWidth(token, fontSize);

      if (tokenW > maxWidth) {
        for (let c = 0; c < token.length; c++) {
          const ch = token[c];
          const chW = getTextLineWidth(ch, fontSize);
          if (curWidth + chW > maxWidth && curLine.length > 0) {
            resultLines.push(curLine);
            curLine = ch;
            curWidth = chW;
          } else {
            curLine += ch;
            curWidth += chW;
          }
        }
        continue;
      }

      if (curWidth + tokenW > maxWidth && curLine.length > 0) {
        resultLines.push(curLine);
        if (/^\s+$/.test(token)) {
          curLine = "";
          curWidth = 0;
        } else {
          curLine = token;
          curWidth = tokenW;
        }
      } else {
        curLine += token;
        curWidth += tokenW;
      }
    }
    if (curLine.length > 0) {
      resultLines.push(curLine);
    }
  }

  return resultLines.length > 0 ? resultLines : [""];
}

const measureCanvas = (typeof document !== "undefined" && typeof document.createElement === "function") ? document.createElement("canvas") : null;
const measureCtx = measureCanvas && typeof measureCanvas.getContext === "function" ? measureCanvas.getContext("2d") : null;
const textWidthCache = new Map();

let cachedFontFamily = null;
export function getActiveFontFamily() {
  if (!cachedFontFamily) {
    const cfg = getGlobalSettings();
    cachedFontFamily = `${cfg.fontEn}, ${cfg.fontZh}`;
  }
  return cachedFontFamily;
}

export function invalidateFontCache() {
  cachedFontFamily = null;
  textWidthCache.clear();
}

bus.on(EVENTS.CONFIG_CHANGE, () => invalidateFontCache());

export function markNodeLayoutDirty(nodeOrId, root) {
  if (!root) return;
  const targetId = typeof nodeOrId === "object" ? nodeOrId?.id : nodeOrId;
  if (!targetId || targetId === root.id) {
    root._layoutDirty = true;
    return;
  }
  const ancestors = getAncestors(targetId, root);
  if (ancestors && ancestors.length > 0) {
    for (let i = 0; i < ancestors.length; i++) {
      ancestors[i]._layoutDirty = true;
    }
  } else {
    root._layoutDirty = true;
  }
}

/**
 * 🌟 快速字符宽度预估引擎 (Fast Math Estimator)
 * 纯数学码点判定，避免在 20,000 节点冷启动时连续触发 20,000 次底层 OS 字形渲染引擎
 */
export function getTextLineWidth(text, fontSize) {
  const raw = String(text ?? "");
  if (!raw) return 0;
  if (measureCtx) {
    const fontFam = getActiveFontFamily();
    const cacheKey = `${raw}_${fontSize}_${fontFam}`;
    let w = textWidthCache.get(cacheKey);
    if (w === undefined) {
      measureCtx.font = `500 ${fontSize}px ${fontFam}`;
      w = Math.ceil(measureCtx.measureText(raw).width);
      if (textWidthCache.size >= 12000) {
        const iter = textWidthCache.keys();
        for (let j = 0; j < 2500; j++) textWidthCache.delete(iter.next().value);
      }
      textWidthCache.set(cacheKey, w);
    }
    return w;
  }
  return estimateTextWidthFast(raw, fontSize);
}

export function estimateTextWidthFast(text, fontSize) {
  const raw = String(text ?? "");
  if (!raw) return 0;
  const lines = raw.split(/\r?\n/);
  let maxW = 0;

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    let w = 0;
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      if (code >= 0x20 && code <= 0x7e) {
        const ch = line[i];
        if ("iljt!|'`:;,. ".indexOf(ch) !== -1) {
          w += fontSize * 0.32;
        } else if ("mwMW@%#&".indexOf(ch) !== -1) {
          w += fontSize * 0.88;
        } else if (code >= 0x30 && code <= 0x39) {
          w += fontSize * 0.56;
        } else if (code >= 0x41 && code <= 0x5a) {
          w += fontSize * 0.68;
        } else {
          w += fontSize * 0.54;
        }
      } else if (code > 0x7e) {
        w += fontSize * 1.0;
      }
    }
    if (w > maxW) maxW = w;
  }
  return Math.ceil(maxW);
}

export function measureTextWidth(text, fontSize = 13.5, fontWeight = "500", fontStyle = "normal", fastEstimate = true) {
  const rawText = String(text ?? "");
  
  // 对于冷启动或非短文本，优先使用纯数学预估，彻底杜绝主线程卡死
  if (fastEstimate && rawText.length > 0) {
    return estimateTextWidthFast(rawText, fontSize);
  }

  const fontFam = getActiveFontFamily();
  const lines = rawText.split(/\r?\n/);
  let maxW = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cacheKey = `${line}_${fontSize}_${fontWeight}_${fontStyle}_${fontFam}`;
    let width = textWidthCache.get(cacheKey);
    if (width === undefined) {
      measureCtx.font = `${fontStyle !== "normal" ? fontStyle + " " : ""}${fontWeight} ${fontSize}px ${fontFam}`;
      width = measureCtx.measureText(line).width;
      if (textWidthCache.size >= 12000) {
        const iter = textWidthCache.keys();
        for (let j = 0; j < 2500; j++) textWidthCache.delete(iter.next().value);
      }
      textWidthCache.set(cacheKey, width);
    }
    if (width > maxW) maxW = width;
  }
  return maxW;
}

export function measureNodeSize(node, level, focusedRootId) {
  const isRoot = node.id === focusedRootId;
  const isLevel1 = level === 1;
  // 🌟 Apple 原生视觉梯次：根节点 18px 庄重有力，一级主干 14.5px 挺拔，二级及细节 13.5px
  const defFontSize = isRoot ? 18 : (isLevel1 ? 14.5 : 13.5);
  const defFontWeight = isRoot ? "700" : (isLevel1 ? "600" : "500");
  const fontSize = node.fontSize ? parseFloat(node.fontSize) : defFontSize;
  const fontWeight = node.fontWeight || defFontWeight;
  const fontStyle = node.fontStyle || "normal";
  const textDecoration = node.textDecoration || "none";
  const fontFam = getActiveFontFamily();

  const contentSignature = `${node.text}_${fontSize}_${fontWeight}_${fontStyle}_${textDecoration}_${node.icon || ""}_${node.priority || ""}_${node.progress || ""}_${node.note ? "1" : "0"}_${node.link ? "1" : "0"}_${(node.tags || []).join(",")}_${fontFam}_w8_${node.todo ? (node.done ? "2" : "1") : "0"}`;
  if (node._sizeSignature === contentSignature && node.width && node.height) return;

  const lineHeight = Math.round(fontSize * 1.32);
  const maxAllowedTextW = isRoot ? MAX_ROOT_TEXT_WIDTH : MAX_NODE_TEXT_WIDTH;
  const lines = wrapTextLines(node.text, fontSize, maxAllowedTextW);

  let maxLineW = 0;
  for (let i = 0; i < lines.length; i++) {
    const lw = getTextLineWidth(lines[i], fontSize);
    if (lw > maxLineW) maxLineW = lw;
  }
  const textWidth = Math.min(maxLineW, maxAllowedTextW);

  let extraLeftWidth = 0;
  if (node.icon) extraLeftWidth += 18;
  if (node.priority) extraLeftWidth += 22;
  if (node.progress !== undefined && node.progress !== null && node.progress !== '') extraLeftWidth += 17;
  if (node.todo) extraLeftWidth += 18;
  if (node.note) extraLeftWidth += 18;
  if (node.link) extraLeftWidth += 17;

  let tagsWidth = 0;
  if (node.tags && Array.isArray(node.tags) && node.tags.length > 0) {
    tagsWidth += 5;
    for (let i = 0; i < node.tags.length; i++) {
      tagsWidth += getTextLineWidth(String(node.tags[i]), 9.5) + 11;
      if (i < node.tags.length - 1) tagsWidth += 3;
    }
  }

  // 🌟 黄金纵横比：根节点 44px 沉稳锚定，一级节点 33px 留白舒适，二级节点 27px
  const padX = isRoot ? 22 : (isLevel1 ? 12 : 9);
  const padY = isRoot ? 11 : (isLevel1 ? 7 : 5.5);
  const minH = isRoot ? 44 : (isLevel1 ? 33 : 27);
  const minW = isRoot ? 80 : (isLevel1 ? 44 : 34);

  node.contentWidth = extraLeftWidth + textWidth + tagsWidth;
  node.width = Math.max(minW, Math.ceil(node.contentWidth + padX * 2));
  const rawH = Math.ceil((lines.length - 1) * lineHeight + fontSize + padY * 2);
  node.height = Math.max(minH, rawH);

  node.extraLeftWidth = extraLeftWidth;
  node.textWidth = textWidth;
  node.lines = lines;
  node.lineHeight = lineHeight;
  node._sizeSignature = contentSignature;
}

/**
 * @param {import('../../types').MindNode} root
 * @param {number} [level]
 * @param {string} [focusedRootId]
 * @param {string} [structure]
 * @param {string} [density]
 */
export function computeLayout(root, level = 0, focusedRootId = "root", structure = "mindmap", density = "normal", forceAll = false) {
  const spacing = SPACING_CONFIG[density] || SPACING_CONFIG.normal;
  const { hGap, vGap } = spacing;

  const postOrder = [];
  const stack = [{ node: root, lvl: level }];

  while (stack.length > 0) {
    const { node, lvl } = stack.pop();
    measureNodeSize(node, lvl, focusedRootId);

    node.treeMinX = undefined;
    node.treeMaxX = undefined;
    node.treeMinY = undefined;
    node.treeMaxY = undefined;

    postOrder.push({ node, lvl });
    if (node.children && !node.collapsed) {
      // 增量短路优化：非全量排版下，未标记脏且已有几何尺寸的干净子树无需深入遍历
      if (!forceAll && node._layoutDirty === false && node.treeWidth !== undefined && node.treeHeight !== undefined) {
        continue;
      }
      for (let i = 0; i < node.children.length; i++) {
        stack.push({ node: node.children[i], lvl: lvl + 1 });
      }
    }
  }

  for (let i = postOrder.length - 1; i >= 0; i--) {
    const { node } = postOrder[i];
    if (!forceAll && node._layoutDirty === false && node.treeWidth !== undefined && node.treeHeight !== undefined) {
      continue;
    }
    node._layoutDirty = false;

    if (!node.children || node.children.length === 0 || node.collapsed) {
      node.treeHeight = node.height;
      node.treeWidth = node.width;
      continue;
    }

    if (structure === "org-down") {
      let childrenWidth = 0;
      for (let idx = 0; idx < node.children.length; idx++) {
        childrenWidth += node.children[idx].treeWidth;
        if (idx > 0) childrenWidth += hGap;
      }
      node.treeWidth = Math.max(node.width, childrenWidth);
      node.treeHeight = node.height;
    } else if (structure === "mindmap" && node.id === focusedRootId) {
      node.rightChildren = [];
      node.leftChildren = [];
      for (let idx = 0; idx < node.children.length; idx++) {
        const child = node.children[idx];
        if (!child.branchDirection || (child.branchDirection !== "left" && child.branchDirection !== "right")) {
          child.branchDirection = node.rightChildren.length <= node.leftChildren.length ? "right" : "left";
        }
        if (child.branchDirection === "left") {
          node.leftChildren.push(child);
        } else {
          node.rightChildren.push(child);
        }
      }

      let rHeight = 0, rWidth = 0;
      for (let idx = 0; idx < node.rightChildren.length; idx++) {
        const child = node.rightChildren[idx];
        rHeight += child.treeHeight;
        if (idx > 0) rHeight += vGap;
        if (child.treeWidth > rWidth) rWidth = child.treeWidth;
      }
      node.rightTreeHeight = Math.max(node.height, rHeight);

      let lHeight = 0, lWidth = 0;
      for (let idx = 0; idx < node.leftChildren.length; idx++) {
        const child = node.leftChildren[idx];
        lHeight += child.treeHeight;
        if (idx > 0) lHeight += vGap;
        if (child.treeWidth > lWidth) lWidth = child.treeWidth;
      }
      node.leftTreeHeight = Math.max(node.height, lHeight);
      node.treeHeight = Math.max(node.rightTreeHeight, node.leftTreeHeight);
      node.treeWidth = node.width + (rWidth > 0 ? (hGap + rWidth) : 0) + (lWidth > 0 ? (hGap + lWidth) : 0);
    } else {
      let childrenHeight = 0, maxChildW = 0;
      for (let idx = 0; idx < node.children.length; idx++) {
        const child = node.children[idx];
        childrenHeight += child.treeHeight;
        if (idx > 0) childrenHeight += vGap;
        if (child.treeWidth > maxChildW) maxChildW = child.treeWidth;
      }
      node.treeHeight = Math.max(node.height, childrenHeight);
      node.treeWidth = node.width + (node.children.length > 0 ? (hGap + maxChildW) : 0);
    }
  }
}

/**
 * @param {import('../../types').MindNode} root
 * @param {number} startX
 * @param {number} startY
 * @param {string} [focusedRootId]
 * @param {string} [structure]
 * @param {string | null} [defDirection]
 * @param {any} [defTheme]
 * @param {string} [paletteKey]
 * @param {string} [density]
 * @param {any} [targetSpatialIndex]
 */
export function assignCoordinates(root, startX, startY, focusedRootId = "root", structure = "mindmap", defDirection = null, defTheme = null, paletteKey = "apple-classic", density = "normal", targetSpatialIndex = null, forceRebuildSpatial = false) {
  const currentPalette = COLOR_PALETTES[paletteKey] || COLOR_PALETTES["apple-classic"];
  const paletteList = currentPalette.branches;
  const spacing = SPACING_CONFIG[density] || SPACING_CONFIG.normal;
  const { hGap, vGap } = spacing;

  const isColdStart = targetSpatialIndex && !targetSpatialIndex.divided && targetSpatialIndex.items.length === 0;
  if (targetSpatialIndex && (forceRebuildSpatial || isColdStart)) {
    targetSpatialIndex.clear();
  }

  let initialDir = defDirection;
  if (!initialDir) {
    initialDir = (structure === "logic-left") ? "left" : ((structure === "org-down") ? "down" : "right");
  }

  const queue = [{
    node: root,
    x: startX,
    y: startY,
    direction: initialDir,
    theme: defTheme
  }];

  const processedList = [];

  while (queue.length > 0) {
    const { node, x, y, direction, theme } = queue.shift();
    node.x = x;
    node.y = y;
    node.branchDirection = direction;
    node.paletteKey = paletteKey;

    node.treeMinX = node.x;
    node.treeMaxX = node.x + node.width;
    node.treeMinY = node.y;
    node.treeMaxY = node.y + node.height;

    if (node.id === focusedRootId) node.rootTheme = currentPalette.root;
    if (theme) node.colorTheme = theme;

    if (targetSpatialIndex) {
      const spatialItem = {
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        node: node
      };
      if (forceRebuildSpatial || isColdStart) {
        targetSpatialIndex.insert(spatialItem);
      } else {
        const prev = node._prevSpatial;
        if (!prev || prev.x !== node.x || prev.y !== node.y || prev.width !== node.width || prev.height !== node.height) {
          targetSpatialIndex.update(spatialItem);
        }
      }
      node._prevSpatial = { x: node.x, y: node.y, width: node.width, height: node.height };
    }

    processedList.push(node);

    if (node.children && node.children.length > 0 && !node.collapsed) {
      if (structure === "org-down") {
        let curX = x + node.width / 2 - node.treeWidth / 2;
        node.children.forEach((child, idx) => {
          const nextTheme = (node.id === focusedRootId) ? paletteList[idx % paletteList.length] : node.colorTheme;
          const childX = curX + child.treeWidth / 2 - child.width / 2;
          queue.push({ node: child, x: childX, y: y + node.height + 48, direction: "down", theme: nextTheme });
          curX += child.treeWidth + hGap;
        });
      } else if (structure === "mindmap" && node.id === focusedRootId) {
        let startYR = y + node.height / 2 - node.rightTreeHeight / 2;
        node.rightChildren.forEach((child, idx) => {
          const nextTheme = paletteList[(idx * 2) % paletteList.length];
          const childY = startYR + child.treeHeight / 2 - child.height / 2;
          queue.push({ node: child, x: x + node.width + hGap, y: childY, direction: "right", theme: nextTheme });
          startYR += child.treeHeight + vGap;
        });

        let startYL = y + node.height / 2 - node.leftTreeHeight / 2;
        node.leftChildren.forEach((child, idx) => {
          const nextTheme = paletteList[(idx * 2 + 1) % paletteList.length];
          const childY = startYL + child.treeHeight / 2 - child.height / 2;
          queue.push({ node: child, x: x - child.width - hGap, y: childY, direction: "left", theme: nextTheme });
          startYL += child.treeHeight + vGap;
        });
      } else {
        const activeDir = (structure === "logic-left") ? "left" : (structure === "logic-right" ? "right" : direction);
        let curY = y + node.height / 2 - node.treeHeight / 2;

        node.children.forEach((child, idx) => {
          const nextTheme = (node.id === focusedRootId) ? paletteList[idx % paletteList.length] : node.colorTheme;
          const childY = curY + child.treeHeight / 2 - child.height / 2;
          const childX = (activeDir === "left") ? (x - child.width - hGap) : (x + node.width + hGap);
          queue.push({ node: child, x: childX, y: childY, direction: activeDir, theme: nextTheme });
          curY += child.treeHeight + vGap;
        });
      }
    }
  }

  for (let i = processedList.length - 1; i >= 0; i--) {
    const node = processedList[i];
    if (node.children && !node.collapsed) {
      for (let c of node.children) {
        if (c.treeMinX !== undefined) {
          node.treeMinX = Math.min(node.treeMinX, c.treeMinX);
          node.treeMaxX = Math.max(node.treeMaxX, c.treeMaxX);
          node.treeMinY = Math.min(node.treeMinY, c.treeMinY);
          node.treeMaxY = Math.max(node.treeMaxY, c.treeMaxY);
        }
      }
    }
  }
}
