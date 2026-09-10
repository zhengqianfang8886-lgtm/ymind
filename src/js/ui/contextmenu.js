import { state, saveSnapshot, findNode, findParent, getActiveTab, sanitizeTreeForHistory, getActiveDocumentContext } from "../core/state.js";
import { executeCommand, COMMANDS } from "../core/history.js";
import { smartCenterOnSelectedNode, camera } from "../core/camera.js";
import { bus, EVENTS } from "../core/event-bus.js";
import { copyNodeDeepLink, promptEditNodeLink, navigateDeepLink } from "./deep-link.js";
import { toggleNodeTodo } from "./todo.js";
import { copySelectedNodes, cutSelectedNodes, pasteNodes } from "../interaction/node-actions.js";
import { promptEditDueDate } from "./due-date.js";

const menu = document.getElementById("apple-context-menu");
let targetNodeId = null;
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
  window.addEventListener("contextmenu", (e) => {
    const isInput = e.target && (e.target.closest("input, textarea, select, [contenteditable=true]") || e.target.isContentEditable);
    if (!isInput) {
      e.preventDefault();
    } else {
      return;
    }

    const vp = document.getElementById("viewport");
    if (!vp || !vp.contains(e.target)) {
      if (menu) menu.classList.add("hidden");
      return;
    }

    const rect = vp.getBoundingClientRect();
    const s = camera.transform.scale;
    const worldX = (e.clientX - rect.left - camera.transform.x) / s;
    const worldY = (e.clientY - rect.top - camera.transform.y) / s;

    const curTab = getActiveTab();
    let node = curTab?.spatialIndex?.pickNode(worldX, worldY, 8);

    if (!node) {
      if (menu) menu.classList.add("hidden");
      return;
    }

    targetNodeId = node.id;
    const docCtx = getActiveDocumentContext();
    // 🌟 若右键点击的节点已处于多选集合中，保留完整选区；否则切换为单选
    if (docCtx) {
      if (!docCtx.selectedIds?.has(targetNodeId)) {
        docCtx.selectNode(targetNodeId);
      }
    }
    bus.emit(EVENTS.RENDER_APP);

    if (!menu) return;

    const menuWidth = 190;
    const menuHeight = 220;
    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth - 10;
    if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight - 10;

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    menu.classList.remove("hidden");
  }, { signal });

  window.addEventListener("mousedown", (e) => {
    if (menu && !menu.contains(e.target)) {
      menu.classList.add("hidden");
    }
  }, { signal });

  if (menu) {
    menu.querySelectorAll(".context-menu-item").forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        menu.classList.add("hidden");
        const action = item.dataset.action;
        handleMenuAction(action, renderApp);
      };
    });
  }
}

function handleMenuAction(action, renderApp) {
  const docCtx = getActiveDocumentContext();
  if (!docCtx || !docCtx.mindData) return;
  const node = findNode(targetNodeId, docCtx.mindData);
  if (!node) return;

  if (action === "copy") {
    copySelectedNodes(docCtx, node);
  } else if (action === "cut") {
    cutSelectedNodes(docCtx, node);
  } else if (action === "paste") {
    pasteNodes(node, docCtx);
  } else if (action === "edit-link") {
    promptEditNodeLink(node);
  } else if (action === "toggle-todo") {
    toggleNodeTodo(node);
  } else if (action === "edit-due-date") {
    promptEditDueDate(node);
  } else if (action === "export-snap") {
    import("./snapshot.js").then(m => m.openSnapshotModal(node));
  } else if (action === "copy-deep-link") {
    copyNodeDeepLink(node);
  } else if (action === "open-link") {
    if (node.link) navigateDeepLink(node.link);
  } else if (action === "toggle-collapse") {
    if (node.children && node.children.length > 0) {
      const nextCollapsed = !node.collapsed;
      import("../render/node-animator.js").then(({ nodeAnimator }) => {
        if (nextCollapsed) nodeAnimator.collapseBranch(node);
        else nodeAnimator.prepareExpand(node);
      });
      docCtx.executeCommand({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: node.id,
        oldAttrs: { collapsed: Boolean(node.collapsed) },
        newAttrs: { collapsed: nextCollapsed }
      });
      docCtx.markLayoutDirty(node.id);
      bus.emit(EVENTS.RENDER_APP);
    }
  } else if (action === "focus") {
    docCtx.focusedRootId = (docCtx.focusedRootId === node.id) ? (docCtx.mindData?.id || "root") : node.id;
    docCtx.isLayoutDirty = true;
    bus.emit(EVENTS.RENDER_APP);
    smartCenterOnSelectedNode(state, true, docCtx);
  } else if (action === "delete") {
    if (node.id === docCtx.focusedRootId) return;
    const parent = findParent(node.id, docCtx.mindData);
    if (parent) {
      const idx = parent.children.findIndex(c => c.id === node.id);
      const subCommands = [{
        type: COMMANDS.REMOVE_NODE,
        nodeId: node.id,
        oldParentId: parent.id,
        oldIndex: idx,
        oldNode: node
      }];

      // 🌟 右键删除子项联动清算父级
      const remainingChildren = (parent.children || []).filter(c => c.id !== node.id);
      const todoChildren = remainingChildren.filter(c => c.todo);
      let newPrg = null;
      if (todoChildren.length > 0) {
        const doneCount = todoChildren.filter(c => c.done).length;
        const pct = Math.round((doneCount / todoChildren.length) * 100);
        newPrg = `${pct}%`;
      }
      if (parent.progress !== newPrg) {
        subCommands.push({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: parent.id,
          oldAttrs: { progress: parent.progress || null },
          newAttrs: { progress: newPrg }
        });
        docCtx.markLayoutDirty(parent.id);
      }

      if (subCommands.length === 1) docCtx.executeCommand(subCommands[0]);
      else docCtx.executeCompoundCommand(subCommands);
      docCtx.selectNode(parent.id);
      bus.emit(EVENTS.RENDER_APP);
    }
  }
}
