import { state, findNode, findParent, getActiveDocumentContext } from "../core/state.js";
import { getActiveFontFamily, MAX_NODE_TEXT_WIDTH, MAX_ROOT_TEXT_WIDTH, getTextLineWidth, wrapTextLines } from "../geometry/layout.js";
import { camera, stopAllCameraAnimations } from "../core/camera.js";
import { COMMANDS } from "../core/history.js";
import { bus, EVENTS } from "../core/event-bus.js";

const inlineEditor = document.getElementById("inline-editor");
const viewport = document.getElementById("viewport");

export function getNodeEditorMetrics(node, s, customCtx = null, currentText = null) {
  const ctx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  const isRoot = ctx ? (node.id === ctx.focusedRootId) : false;
  const baseSize = node.fontSize ? parseFloat(node.fontSize) : (isRoot ? 18 : 14);
  const fontSizePx = Math.round(baseSize * s);
  const lineHeightPx = Math.round((node.lineHeight || Math.round(baseSize * 1.36)) * s);

  const rawPlaceholder = inlineEditor?.placeholder || (node.text || "新主题");
  const textToMeasure = (currentText !== null && currentText !== undefined && currentText.length > 0)
    ? currentText
    : rawPlaceholder;

  // 🌟 单行最大受限宽度：避免文字漫无边际横向拉扯
  const maxAllowedWorldW = isRoot ? MAX_ROOT_TEXT_WIDTH : MAX_NODE_TEXT_WIDTH;
  const maxAllowedScreenW = Math.round(maxAllowedWorldW * s + 16);

  // 实时分词测算折行后的多行集合
  const wrappedLines = wrapTextLines(textToMeasure, baseSize, maxAllowedWorldW);
  let maxLW = 0;
  for (let i = 0; i < wrappedLines.length; i++) {
    const lw = getTextLineWidth(wrappedLines[i], baseSize);
    if (lw > maxLW) maxLW = lw;
  }
  const textPx = Math.ceil(maxLW * s);

  // 宽度在最小呼吸宽度与最大约束宽度之间自然缩放
  const minEditorW = Math.max(Math.round(80 * s), 72);
  const editorWidth = Math.min(maxAllowedScreenW, Math.max(minEditorW, textPx + 20));

  const padX = Math.max(4, Math.round((node.width - (node.contentWidth || 0)) / 2));
  const currentOffset = padX + (node.extraLeftWidth || 0);
  const textStartX = node.x + currentOffset;
  const textScreenX = Math.round(textStartX * s + camera.transform.x - 4);

  // 始终以首行视觉基线精准贴合
  const centerY = node.y + node.height / 2;
  const origLines = node.lines || wrapTextLines(node.text, baseSize, maxAllowedWorldW);
  const origTotalH = (origLines.length - 1) * (node.lineHeight || Math.round(baseSize * 1.36));
  const firstLineCenterY = centerY - origTotalH / 2;
  const textScreenY = Math.round((firstLineCenterY - (node.lineHeight || Math.round(baseSize * 1.36)) / 2) * s + camera.transform.y - 4);

  const minEditorHeight = lineHeightPx + 8;
  return { fontSizePx, lineHeightPx, textScreenX, textScreenY, editorWidth, minEditorHeight, maxAllowedScreenW, wrappedLines };
}

export function syncInlineEditorPosition() {
  if (!state.editingNodeId || !inlineEditor || inlineEditor.classList.contains("hidden")) return;
  const ctx = getActiveDocumentContext();
  const node = ctx ? findNode(state.editingNodeId, ctx.mindData) : null;
  if (!node || node.x === undefined) return;

  const s = camera.transform.scale;
  const m = getNodeEditorMetrics(node, s, ctx, inlineEditor.value);

  inlineEditor.style.transform = "none";
  inlineEditor.style.left = `${m.textScreenX}px`;
  inlineEditor.style.top = `${m.textScreenY}px`;
  inlineEditor.style.width = `${m.editorWidth}px`;
  inlineEditor.style.maxWidth = `${m.maxAllowedScreenW}px`;
  inlineEditor.style.fontSize = `${m.fontSizePx}px`;
  inlineEditor.style.lineHeight = `${m.lineHeightPx}px`;

  // 🌟 多行高度自适应流式展开
  inlineEditor.style.height = "auto";
  const actualH = Math.max(m.minEditorHeight, inlineEditor.scrollHeight);
  inlineEditor.style.height = `${actualH}px`;
}

export function startNodeEdit(node, stateRef, onRender, isNewNode = false, customCtx = null) {
  if (!node || !viewport || !inlineEditor) return;
  stopAllCameraAnimations();
  state.editingNodeId = node.id;
  try {
    bus.emit(EVENTS.RENDER_APP);
  } catch (err) {
    console.warn("[YMind] Soft render emit bypass:", err);
  }

  const ctx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  const originalText = String(node.text ?? "");
  const s = camera.transform.scale;
  const isRoot = ctx ? (node.id === ctx.focusedRootId) : false;
  const m = getNodeEditorMetrics(node, s, ctx);

  inlineEditor.style.position = "absolute";
  inlineEditor.style.transform = "none";
  inlineEditor.style.left = `${m.textScreenX}px`;
  inlineEditor.style.top = `${m.textScreenY}px`;
  inlineEditor.style.width = `${m.editorWidth}px`;
  inlineEditor.style.maxWidth = `${m.maxAllowedScreenW}px`;
  inlineEditor.style.fontSize = `${m.fontSizePx}px`;
  inlineEditor.style.lineHeight = `${m.lineHeightPx}px`;
  inlineEditor.style.fontFamily = getActiveFontFamily();
  inlineEditor.style.fontWeight = String(node.fontWeight || (isRoot ? "700" : "500"));
  inlineEditor.style.fontStyle = node.fontStyle || "normal";
  inlineEditor.style.textDecoration = node.textDecoration || "none";
  inlineEditor.style.color = node.textColor && node.textColor !== "default" ? node.textColor : "var(--text-primary)";
  inlineEditor.style.whiteSpace = "pre-wrap";
  inlineEditor.style.wordBreak = "break-word";
  inlineEditor.style.overflowWrap = "break-word";
  inlineEditor.removeAttribute("maxlength");

  if (isNewNode) {
    inlineEditor.value = "";
    inlineEditor.placeholder = node.text || "新分支";
  } else {
    inlineEditor.value = node.text || "";
    inlineEditor.placeholder = "";
  }

  inlineEditor.classList.remove("hidden");
  void inlineEditor.offsetWidth;

  // 初始多行高度计算
  inlineEditor.style.height = "auto";
  const initialH = Math.max(m.minEditorHeight, inlineEditor.scrollHeight);
  inlineEditor.style.height = `${initialH}px`;

  inlineEditor.focus();
  const caretPos = inlineEditor.value.length;
  inlineEditor.setSelectionRange(caretPos, caretPos);

  requestAnimationFrame(() => {
    if (state.editingNodeId === node.id) {
      inlineEditor.focus();
      const p = inlineEditor.value.length;
      inlineEditor.setSelectionRange(p, p);
    }
  });

  const updateEditorGeometry = () => {
    const curM = getNodeEditorMetrics(node, s, ctx, inlineEditor.value);
    inlineEditor.style.transform = "none";
    inlineEditor.style.left = `${curM.textScreenX}px`;
    inlineEditor.style.top = `${curM.textScreenY}px`;
    inlineEditor.style.width = `${curM.editorWidth}px`;
    inlineEditor.style.maxWidth = `${curM.maxAllowedScreenW}px`;
    inlineEditor.style.fontSize = `${curM.fontSizePx}px`;
    inlineEditor.style.lineHeight = `${curM.lineHeightPx}px`;

    inlineEditor.style.height = "auto";
    const actualH = Math.max(curM.minEditorHeight, inlineEditor.scrollHeight);
    inlineEditor.style.height = `${actualH}px`;
  };

  let isIMEComposing = false;
  inlineEditor.oncompositionstart = () => { isIMEComposing = true; };
  inlineEditor.oncompositionupdate = () => { updateEditorGeometry(); };
  inlineEditor.oncompositionend = () => {
    isIMEComposing = false;
    updateEditorGeometry();
  };

  inlineEditor.oninput = updateEditorGeometry;

  let finished = false;
  const finish = (nextAction = "none", isCancelled = false) => {
    if (finished) return;
    finished = true;
    inlineEditor.oninput = null;
    inlineEditor.oncompositionstart = null;
    inlineEditor.oncompositionend = null;
    inlineEditor.classList.add("hidden");
    inlineEditor.style.transform = "none";

    let val = inlineEditor.value.trim();
    state.editingNodeId = null;

    if (isCancelled || (val === "" && isNewNode)) {
      if (isNewNode && ctx) {
        const tab = ctx.tab;
        const lastRec = tab?.historyStack?.[tab.historyIndex];
        const parent = findParent(node.id, ctx.mindData);
        if (lastRec?.type === "COMMAND" && lastRec.payload?.type === COMMANDS.INSERT_NODE && lastRec.payload.node?.id === node.id) {
          ctx.undo();
          tab.historyStack.splice(tab.historyIndex + 1);
        } else if (parent) {
          parent.children = parent.children.filter(c => c.id !== node.id);
        }
        if (parent) {
          ctx.selectNode(parent.id);
          ctx.markLayoutDirty(parent.id);
        }
      }
      onRender();
      return;
    }

    if (val !== "" && val !== originalText && ctx) {
      ctx.executeCommand({
        type: COMMANDS.SET_TEXT,
        nodeId: node.id,
        oldText: originalText,
        newText: val
      });
      ctx.markLayoutDirty(node.id);
      if (ctx.tab) ctx.tab.isLayoutDirty = true;
      if (node.id === ctx.mindData?.id) {
        if (!ctx.tab.filePath) ctx.tab.title = val;
      }
    }
    onRender();

    if (nextAction === "sibling" && val !== "") {
      bus.emit(EVENTS.NODE_ADD_SIBLING, { ctx });
    } else if (nextAction === "child" && val !== "") {
      bus.emit(EVENTS.NODE_ADD_CHILD, { ctx });
    }
  };

  inlineEditor.onmousedown = (e) => e.stopPropagation();
  inlineEditor.onclick = (e) => e.stopPropagation();
  inlineEditor.ondblclick = (e) => e.stopPropagation();
  inlineEditor.onblur = () => finish("none", false);
  inlineEditor.onkeydown = (e) => {
    e.stopPropagation();
    if (isIMEComposing || e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      // 🌟 Shift+Enter / Alt+Enter / Ctrl+Enter: 插入换行并自动向下撑开高度
      if (e.shiftKey || e.altKey || e.ctrlKey) {
        requestAnimationFrame(updateEditorGeometry);
      } else {
        e.preventDefault();
        finish("none", false);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish("child", false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish("none", true);
    }
  };
}
