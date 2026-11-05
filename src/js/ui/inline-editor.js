import { state, findNode, findParent, getActiveDocumentContext } from "../core/state.js";
import { camera, stopAllCameraAnimations } from "../core/camera.js";
import { COMMANDS, abortDraftNodeCreation } from "../core/history.js";
import { bus, EVENTS } from "../core/event-bus.js";
import { syncInspectorUi } from "./inspector.js";
import { getNodeTextGeometry } from "../geometry/text-metrics.js";
import { measureTextWidth, MAX_NODE_TEXT_WIDTH, MAX_ROOT_TEXT_WIDTH } from "../geometry/layout.js";

const inlineEditor = document.getElementById("inline-editor");
const viewport = document.getElementById("viewport");

let lockedWorldLeft = null;
let lockedWorldTop = null;
let maxAllowedWorldW = MAX_NODE_TEXT_WIDTH;
let lastCompositionEndTime = 0;
let updateGeometryCallback = null;

export function getNodeEditorMetrics(node, s, customCtx = null, currentText = null) {
  const ctx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  const geo = getNodeTextGeometry(node, s, camera.transform, ctx);
  if (!geo) return null;

  const isRoot = ctx ? (node.id === ctx.focusedRootId) : (node.id === "root");
  const limitWorldW = isRoot ? MAX_ROOT_TEXT_WIDTH : MAX_NODE_TEXT_WIDTH;
  const maxScreenW = Math.ceil(limitWorldW * s);

  const placeholderText = node.text || "新分支";
  const textVal = (currentText !== null && currentText !== undefined && currentText !== "")
    ? currentText
    : placeholderText;
  const lines = String(textVal).split(/\r?\n/);
  let maxLW = 0;
  for (let i = 0; i < lines.length; i++) {
    const lw = measureTextWidth(lines[i], geo.typography.fontSize, geo.typography.fontWeight, geo.typography.fontStyle, false) * s;
    if (lw > maxLW) maxLW = lw;
  }

  const placeholderW = measureTextWidth(placeholderText, geo.typography.fontSize, geo.typography.fontWeight, geo.typography.fontStyle, false) * s;
  const baseMinW = Math.max(72, Math.ceil(placeholderW + 24));
  const dynamicW = Math.min(maxScreenW, Math.max(baseMinW, Math.ceil(maxLW + 24)));
  const editorWidth = Math.min(maxScreenW, Math.max(baseMinW, dynamicW));

  return {
    screenX: Math.round(geo.screen.x - 7),
    screenY: Math.round(geo.screen.y - 3.5),
    editorWidth: editorWidth,
    maxAllowedScreenW: maxScreenW,
    fontSizePx: Math.round(geo.screen.fontSize),
    lineHeightPx: Math.round(geo.screen.lineHeight),
    typography: geo.typography
  };
}

export function syncInlineEditorPosition() {
  if (!state.editingNodeId || !inlineEditor || inlineEditor.classList.contains("hidden")) return;
  if (typeof updateGeometryCallback === "function") {
    updateGeometryCallback();
  }
}

export function startNodeEdit(node, stateRef, onRender, isNewNode = false, customCtx = null) {
  if (!node || !viewport || !inlineEditor) return;
  stopAllCameraAnimations();

  const ctx = (customCtx && customCtx.tab) ? customCtx : getActiveDocumentContext();
  const originalText = String(node.text ?? "");
  const s = camera.transform.scale;
  const geo = getNodeTextGeometry(node, s, camera.transform, ctx);
  if (!geo) return;

  const isRoot = ctx ? (node.id === ctx.focusedRootId) : (node.id === "root");
  maxAllowedWorldW = isRoot ? MAX_ROOT_TEXT_WIDTH : MAX_NODE_TEXT_WIDTH;

  lockedWorldLeft = geo.world.x;
  lockedWorldTop = geo.world.y;

  const m = getNodeEditorMetrics(node, s, ctx);

  inlineEditor.style.position = "absolute";
  inlineEditor.style.transform = "none";
  inlineEditor.style.left = `${m.screenX}px`;
  inlineEditor.style.top = `${m.screenY}px`;
  inlineEditor.style.width = `${m.editorWidth}px`;
  inlineEditor.style.maxWidth = `${m.maxAllowedScreenW}px`;
  inlineEditor.style.fontSize = `${m.fontSizePx}px`;
  inlineEditor.style.lineHeight = `${m.lineHeightPx}px`;
  inlineEditor.style.fontFamily = m.typography.fontFamily;
  inlineEditor.style.fontWeight = String(m.typography.fontWeight);
  inlineEditor.style.fontStyle = m.typography.fontStyle;
  inlineEditor.style.color = m.typography.color || "var(--text-primary)";
  inlineEditor.removeAttribute("maxlength");

  if (isNewNode) {
    inlineEditor.value = "";
    inlineEditor.placeholder = node.text || "新分支";
  } else {
    inlineEditor.value = node.text || "";
    inlineEditor.placeholder = "";
  }

  inlineEditor.classList.remove("hidden");
  state.editingNodeId = node.id;

  try {
    bus.emit(EVENTS.RENDER_APP);
  } catch {}

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
    if (!state.editingNodeId || state.editingNodeId !== node.id) return;
    const currentScale = camera.transform.scale;
    const maxScreenW = Math.ceil(maxAllowedWorldW * currentScale);

    const placeholderText = inlineEditor.placeholder || node.text || "新分支";
    const curVal = inlineEditor.value || placeholderText;
    const lines = curVal.split(/\r?\n/);
    let maxLW = 0;
    for (let i = 0; i < lines.length; i++) {
      const lw = measureTextWidth(lines[i], geo.typography.fontSize, geo.typography.fontWeight, geo.typography.fontStyle, false) * currentScale;
      if (lw > maxLW) maxLW = lw;
    }

    const placeholderW = measureTextWidth(placeholderText, geo.typography.fontSize, geo.typography.fontWeight, geo.typography.fontStyle, false) * currentScale;
    const baseMinW = Math.max(72, Math.ceil(placeholderW + 24));
    const dynamicScreenW = Math.ceil(maxLW + 24);
    const finalW = Math.min(maxScreenW, Math.max(baseMinW, dynamicScreenW));

    const screenX = Math.round(lockedWorldLeft * currentScale + camera.transform.x - 7);
    const screenY = Math.round(lockedWorldTop * currentScale + camera.transform.y - 3.5);

    inlineEditor.style.left = `${screenX}px`;
    inlineEditor.style.top = `${screenY}px`;
    inlineEditor.style.width = `${finalW}px`;
    inlineEditor.style.maxWidth = `${maxScreenW}px`;
    inlineEditor.style.fontSize = `${Math.round(geo.typography.fontSize * currentScale)}px`;
    inlineEditor.style.lineHeight = `${Math.round(geo.typography.lineHeight * currentScale)}px`;

    inlineEditor.style.height = "auto";
    const minH = Math.round(geo.screen.height + 6);
    inlineEditor.style.height = `${Math.max(minH, inlineEditor.scrollHeight)}px`;
  };

  updateGeometryCallback = updateEditorGeometry;
  updateEditorGeometry();

  let isIMEComposing = false;
  inlineEditor.oncompositionstart = () => { isIMEComposing = true; };
  inlineEditor.oncompositionupdate = () => { updateEditorGeometry(); };
  inlineEditor.oncompositionend = () => {
    isIMEComposing = false;
    lastCompositionEndTime = performance.now();
    updateEditorGeometry();
  };

  inlineEditor.oninput = updateEditorGeometry;

  let finished = false;
  const finish = (nextAction = "none", isCancelled = false) => {
    if (finished) return;
    finished = true;
    updateGeometryCallback = null;
    lockedWorldLeft = null;
    lockedWorldTop = null;
    inlineEditor.oninput = null;
    inlineEditor.oncompositionstart = null;
    inlineEditor.oncompositionend = null;
    inlineEditor.classList.add("hidden");

    let val = inlineEditor.value.trim();
    state.editingNodeId = null;

    // 🌟 方案 C：占位符兜底，彻底关闭自动销毁机制，空输入自动填充默认文本，焦点坚挺停留在新节点上
    if (val === "") {
      val = node.todo ? "新待办" : (node.text || (isNewNode ? "新主题" : "新分支"));
    }

    if (val !== originalText && ctx) {
      ctx.executeCommand({
        type: COMMANDS.SET_TEXT,
        nodeId: node.id,
        oldText: originalText,
        newText: val
      });
      delete node._cachedMetrics;
      node._layoutDirty = true;
      ctx.markLayoutDirty(node.id);
      if (ctx.tab) ctx.tab.isLayoutDirty = true;
      if (node.id === ctx.mindData?.id) {
        if (!ctx.tab.filePath) ctx.tab.title = val;
      }
    } else {
      node.text = val;
      delete node._cachedMetrics;
      node._layoutDirty = true;
      if (ctx) ctx.markLayoutDirty(node.id);
    }

    // 🌟 核心：确保焦点锁定在新节点本身，绝对不跳向父节点
    if (ctx) {
      ctx.selectNode(node.id);
    }

    syncInspectorUi(ctx);
    onRender();

    if (nextAction === "child" && val !== "") {
      bus.emit(EVENTS.NODE_ADD_CHILD, { ctx });
    }
  };

  inlineEditor.onmousedown = (e) => e.stopPropagation();
  inlineEditor.onclick = (e) => e.stopPropagation();
  inlineEditor.ondblclick = (e) => e.stopPropagation();
  inlineEditor.onblur = () => finish("none", false);

  inlineEditor.onkeydown = (e) => {
    e.stopPropagation();
    const justComposed = (performance.now() - lastCompositionEndTime) < 60;
    if (isIMEComposing || e.isComposing || e.keyCode === 229 || (justComposed && e.key === "Enter")) {
      return;
    }

    if (e.key === "Enter") {
      if (e.shiftKey || e.altKey || e.ctrlKey) {
        requestAnimationFrame(updateEditorGeometry);
      } else {
        // 🌟 核心：按下 Enter 键仅确认保存当前文字并退出编辑态，绝不继续新建！
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
