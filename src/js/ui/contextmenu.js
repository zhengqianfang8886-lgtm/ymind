import { state, saveSnapshot, findNode, findParent, getActiveTab, sanitizeTreeForHistory, getActiveDocumentContext } from "../core/state.js";
import { executeCommand, COMMANDS } from "../core/history.js";
import { smartCenterOnSelectedNode, camera } from "../core/camera.js";
import { bus, EVENTS } from "../core/event-bus.js";
import { copyNodeDeepLink, promptEditNodeLink, navigateDeepLink } from "./deep-link.js";
import { toggleNodeTodo } from "./todo.js";
import { promptEditDueDate } from "./due-date.js";

const menu = document.getElementById("apple-context-menu");
let targetNodeId = null;

export function initContextMenu(renderApp) {
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
    if (docCtx) docCtx.selectNode(targetNodeId);
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
  });

  window.addEventListener("mousedown", (e) => {
    if (menu && !menu.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });

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
    state.clipboardBranch = sanitizeTreeForHistory(node);
  } else if (action === "cut") {
    if (node.id === docCtx.focusedRootId) return;
    state.clipboardBranch = sanitizeTreeForHistory(node);
    const parent = findParent(node.id, docCtx.mindData);
    if (parent) {
      const idx = parent.children.findIndex(c => c.id === node.id);
      docCtx.executeCommand({
        type: COMMANDS.REMOVE_NODE,
        nodeId: node.id,
        oldParentId: parent.id,
        oldIndex: idx,
        oldNode: node
      });
      docCtx.selectNode(parent.id);
    }
  } else if (action === "paste") {
    if (state.clipboardBranch) {
      const cloned = sanitizeTreeForHistory(state.clipboardBranch);
      function refreshIds(n) {
        n.id = "node_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        if (n.children) n.children.forEach(refreshIds);
      }
      refreshIds(cloned);
      docCtx.executeCommand({
        type: COMMANDS.INSERT_NODE,
        parentId: node.id,
        index: node.children ? node.children.length : 0,
        node: cloned
      });
      node.collapsed = false;
      docCtx.selectNode(cloned.id);
    }
  } else if (action === "edit-link") {
    promptEditNodeLink(node);
  } else if (action === "toggle-todo") {
    toggleNodeTodo(node);
  } else if (action === "edit-due-date") {
    promptEditDueDate(node);
  } else if (action === "copy-deep-link") {
    copyNodeDeepLink(node);
  } else if (action === "open-link") {
    if (node.link) navigateDeepLink(node.link);
  } else if (action === "toggle-collapse") {
    if (node.children && node.children.length > 0) {
      docCtx.executeCommand({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: node.id,
        oldAttrs: { collapsed: Boolean(node.collapsed) },
        newAttrs: { collapsed: !node.collapsed }
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
