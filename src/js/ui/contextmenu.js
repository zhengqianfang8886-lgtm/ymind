import { state, findNode, getActiveDocumentContext } from "../core/state.js";
import { syncInspectorUi } from "./inspector.js";
import { bus, EVENTS } from "../core/event-bus.js";
import { camera } from "../core/camera.js";

let contextMenuAC = null;

export function destroyContextMenu() {
  if (contextMenuAC) {
    contextMenuAC.abort();
    contextMenuAC = null;
  }
}

export function initContextMenu(renderApp) {
  destroyContextMenu();
  contextMenuAC = new AbortController();
  const signal = contextMenuAC.signal;

  // 隐藏残留的原生浮动菜单
  const menu = document.getElementById("apple-context-menu");
  if (menu) {
    menu.classList.add("hidden");
    menu.style.display = "none";
  }

  window.addEventListener("contextmenu", (e) => {
    const isInput = e.target && (e.target.closest("input, textarea, select, [contenteditable=true]") || e.target.isContentEditable);
    if (isInput) return;

    e.preventDefault();

    const vp = document.getElementById("viewport");
    if (!vp || !vp.contains(e.target)) return;

    const rect = vp.getBoundingClientRect();
    const s = camera.transform.scale;
    const worldX = (e.clientX - rect.left - camera.transform.x) / s;
    const worldY = (e.clientY - rect.top - camera.transform.y) / s;

    const docCtx = getActiveDocumentContext();
    const curTab = docCtx?.tab;
    const node = curTab?.spatialIndex?.pickNode(worldX, worldY, 10);

    if (node && docCtx) {
      // 1. 选中该节点
      docCtx.selectNode(node.id);
      bus.emit(EVENTS.RENDER_APP);

      // 2. 自然展开侧边栏并聚焦至节点任务与操作卡片
      const fs = document.getElementById("format-sidebar");
      const layout = document.querySelector(".workspace-body-layout");
      if (fs) {
        fs.classList.remove("collapsed");
        document.getElementById("btn-toggle-format")?.classList.add("active");
        layout?.classList.add("sidebar-open");

        const taskSec = document.querySelector('.inspector-accordion-item[data-section="node-task"]');
        if (taskSec && !taskSec.classList.contains("open")) {
          taskSec.classList.add("open");
        }
      }

      syncInspectorUi();
    }
  }, { signal });
}
