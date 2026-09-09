import { state, findParent, findNode, getActiveDocumentContext } from "../core/state.js";
import { executeCommand, executeCompoundCommand, COMMANDS } from "../core/history.js";
import { PRIORITY_COLORS } from "../data/palettes.js";
import { openNotesDrawer } from "../ui/notes.js";
import { getDueDateStatus, promptEditDueDate } from "../ui/due-date.js";
import { handleNodesMigrationTodoProgress, syncMigratedNodeStyles } from "../ui/todo.js";
import { bus, EVENTS } from "../core/event-bus.js";

let renderAppRef = null;
let isComposingIME = false;
let pendingFocusNodeId = null;

export function renderOutliner(docCtxOrRenderApp, maybeRenderApp) {
  const ctx = (docCtxOrRenderApp && docCtxOrRenderApp.tab) ? docCtxOrRenderApp : getActiveDocumentContext();
  renderAppRef = typeof docCtxOrRenderApp === "function" ? docCtxOrRenderApp : (typeof maybeRenderApp === "function" ? maybeRenderApp : null);

  const outlinerPanel = document.getElementById("outliner-view");
  const outlinerContent = document.getElementById("outliner-content");
  if (!outlinerContent || !outlinerPanel || !ctx) return;

  if (!outlinerPanel._vOutlinerBound) {
    outlinerContent.addEventListener("compositionstart", () => { isComposingIME = true; });
    outlinerContent.addEventListener("compositionend", () => { isComposingIME = false; });
    outlinerPanel._vOutlinerBound = true;
  }

  const root = ctx.mindData;
  if (!root) return;

  renderOutlinerRootHeader(outlinerContent, ctx);
  const visibleItems = collectVisibleNodes(root);
  renderOutlinerListFlow(outlinerContent, visibleItems, ctx, outlinerPanel);

  if (pendingFocusNodeId) {
    const targetInput = outlinerContent.querySelector(`.outliner-row[data-id="${pendingFocusNodeId}"] .outliner-text-input`);
    if (targetInput) {
      targetInput.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(targetInput);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    pendingFocusNodeId = null;
  }
}

function collectVisibleNodes(root) {
  const list = [];
  if (!root.children || root.children.length === 0) return list;

  function traverse(children, parentNode, depth) {
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      list.push({ node, parentNode, depth, index: i });
      if (node.children && node.children.length > 0 && !node.collapsed) {
        traverse(node.children, node, depth + 1);
      }
    }
  }

  traverse(root.children, root, 0);
  return list;
}

function renderOutlinerRootHeader(content, ctx) {
  let rootHeader = content.querySelector(".outliner-root-wrapper");
  if (!rootHeader) {
    rootHeader = document.createElement("div");
    rootHeader.className = "outliner-root-wrapper";
    rootHeader.innerHTML = `<div class="outliner-title-input" contenteditable="true" spellcheck="false"></div>`;
    content.prepend(rootHeader);

    const titleInput = rootHeader.querySelector(".outliner-title-input");
    titleInput.onblur = () => {
      if (isComposingIME) return;
      const val = titleInput.innerText.trim();
      const currentRoot = ctx?.mindData;
      if (val && currentRoot && val !== currentRoot.text) {
        ctx.executeCommand({
          type: COMMANDS.SET_TEXT,
          nodeId: currentRoot.id,
          oldText: currentRoot.text,
          newText: val
        });
      }
    };
  }

  const titleInput = rootHeader.querySelector(".outliner-title-input");
  if (titleInput && document.activeElement !== titleInput && !isComposingIME) {
    titleInput.innerText = ctx?.mindData?.text || "中心主题";
  }
}

const ROW_HEIGHT = 28;
const OVERSCAN = 12;

function renderOutlinerListFlow(content, visibleItems, ctx, panel) {
  let listContainer = content.querySelector(".outliner-list");
  if (!listContainer) {
    const oldVirtual = content.querySelector(".outliner-list-virtual");
    if (oldVirtual) oldVirtual.remove();

    listContainer = document.createElement("div");
    listContainer.className = "outliner-list";
    content.appendChild(listContainer);
  }

  let spacer = listContainer.querySelector(".outliner-virtual-spacer");
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.className = "outliner-virtual-spacer";
    spacer.style.cssText = "position:relative;width:100%;min-width:100%;";
    listContainer.appendChild(spacer);
  }

  let sliceContainer = spacer.querySelector(".outliner-virtual-slice");
  if (!sliceContainer) {
    sliceContainer = document.createElement("div");
    sliceContainer.className = "outliner-virtual-slice";
    sliceContainer.style.cssText = "position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;width:100%;";
    spacer.appendChild(sliceContainer);
  }

  const totalItems = visibleItems.length;
  spacer.style.height = `${totalItems * ROW_HEIGHT}px`;

  if (!panel._vScrollBound) {
    let scrollRaf = null;
    panel.addEventListener("scroll", () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        updateVirtualSlice(sliceContainer, panel, panel._latestVisibleItems || visibleItems, panel._latestCtx || ctx);
      });
    }, { passive: true });
    panel._vScrollBound = true;
  }
  panel._latestVisibleItems = visibleItems;
  panel._latestCtx = ctx;

  // 跨 Tab 或根节点变动时，清理脱水残留的孤儿 DOM 闭包
  if (panel._activeTabId !== ctx.id) {
    sliceContainer.innerHTML = "";
    panel.scrollTop = 0;
    panel._activeTabId = ctx.id;
  }
  updateVirtualSlice(sliceContainer, panel, visibleItems, ctx);
}

function updateVirtualSlice(sliceContainer, panel, visibleItems, ctx) {
  const totalItems = visibleItems.length;
  if (totalItems === 0) {
    sliceContainer.innerHTML = "";
    sliceContainer.style.transform = "translate3d(0,0,0)";
    return;
  }

  const viewportH = panel.clientHeight || 800;
  // 🌟 P1-4 防御：仅在程序主动重定向（pendingFocusNodeId）时滚动视口，用户手动滑动时杜绝回弹死锁
  if (pendingFocusNodeId) {
    const targetIdx = visibleItems.findIndex(it => it.node.id === pendingFocusNodeId);
    if (targetIdx >= 0) {
      const targetTop = targetIdx * ROW_HEIGHT;
      if (targetTop < (panel.scrollTop || 0) || targetTop > (panel.scrollTop || 0) + viewportH - ROW_HEIGHT * 2) {
        panel.scrollTop = Math.max(0, targetTop - Math.floor(viewportH / 2));
      }
    }
  }

  const scrollTop = panel.scrollTop || 0;
  let startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  let endIdx = Math.min(totalItems, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);

  const offsetY = startIdx * ROW_HEIGHT;
  sliceContainer.style.transform = `translate3d(0px, ${offsetY}px, 0)`;

  renderVirtualSliceRows(sliceContainer, visibleItems.slice(startIdx, endIdx), ctx);
}

function renderVirtualSliceRows(listContainer, visibleItems, ctx) {
  const existingRows = new Map();
  Array.from(listContainer.children).forEach(el => {
    if (el.dataset.id) existingRows.set(el.dataset.id, el);
  });

  const activeIds = new Set(visibleItems.map(item => item.node.id));
  const activeEditingId = document.activeElement?.closest?.(".outliner-row")?.dataset?.id;
  existingRows.forEach((el, id) => {
    if (id === pendingFocusNodeId) return;
    if (!activeIds.has(id)) {
      if (id === activeEditingId) {
        // 滚动越界时让编辑行平稳失焦提交，杜绝节点位置错位
        document.activeElement?.blur?.();
      }
      el.remove();
    }
  });

  visibleItems.forEach((item, itemIdx) => {
    const { node, parentNode, depth, index } = item;
    let row = existingRows.get(node.id);
    const hasChildren = node.children && node.children.length > 0;

    if (!row) {
      row = document.createElement("div");
      row.className = "outliner-row";
      row.dataset.id = node.id;

      const toggleIcon = document.createElement("div");
      toggleIcon.className = "outliner-toggle-icon";
      toggleIcon.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      row.appendChild(toggleIcon);

      const bullet = document.createElement("div");
      bullet.className = "outliner-bullet";
      row.appendChild(bullet);

      const badges = document.createElement("div");
      badges.className = "outliner-badges";
      row.appendChild(badges);

      const textDiv = document.createElement("div");
      textDiv.className = "outliner-text-input";
      textDiv.contentEditable = "true";
      textDiv.spellcheck = false;
      row.appendChild(textDiv);

      const noteTag = document.createElement("span");
      noteTag.className = "outliner-note-indicator hidden";
      noteTag.innerText = "📝 备注";
      row.appendChild(noteTag);

      listContainer.appendChild(row);
    }

    row.style.paddingLeft = `${depth * 24 + 10}px`;
    const isSelected = ctx ? ctx.selectedIds.has(node.id) : false;
    row.classList.toggle("selected", isSelected);

    const toggleIcon = row.querySelector(".outliner-toggle-icon");
    toggleIcon.className = `outliner-toggle-icon ${hasChildren ? (node.collapsed ? "collapsed" : "expanded") : "leaf"}`;
    toggleIcon.onclick = async (e) => {
      e.stopPropagation();
      if (hasChildren) {
        // 🌟 需求 1：大纲模式收放时焦点同步切换到该节点
        if (ctx) ctx.selectNode(node.id);
        const nextCollapsed = !node.collapsed;
        const { nodeAnimator } = await import("./node-animator.js");
        if (nextCollapsed) {
          nodeAnimator.collapseBranch(node);
        } else {
          nodeAnimator.prepareExpand(node);
        }
        executeCommand({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: node.id,
          oldAttrs: { collapsed: Boolean(node.collapsed) },
          newAttrs: { collapsed: nextCollapsed }
        });
        if (ctx) ctx.markLayoutDirty(node.id);
        renderOutliner(renderAppRef);
        bus.emit(EVENTS.RENDER_APP);
      }
    };

    const bullet = row.querySelector(".outliner-bullet");
    bullet.onclick = (e) => {
      e.stopPropagation();
      if (ctx) ctx.selectNode(node.id);
      Array.from(listContainer.children).forEach(r => r.classList.toggle("selected", r.dataset.id === node.id));
      bus.emit(EVENTS.RENDER_APP);
    };

    const badges = row.querySelector(".outliner-badges");
    badges.innerHTML = "";
    if (node.todo) {
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "note-task-checkbox";
      chk.checked = Boolean(node.done);
      chk.onclick = async (e) => {
        e.stopPropagation();
        const { toggleTaskDone } = await import("../ui/todo.js");
        toggleTaskDone(node);
      };
      badges.appendChild(chk);
    }
    if (node.icon) {
      const ic = document.createElement("span");
      ic.className = "outliner-icon-tag";
      ic.innerText = node.icon;
      badges.appendChild(ic);
    }
    if (node.priority && PRIORITY_COLORS[node.priority]) {
      const p = document.createElement("span");
      p.className = "apple-tag";
      p.style.background = PRIORITY_COLORS[node.priority].bg;
      p.innerText = node.priority;
      badges.appendChild(p);
    }
    if (node.dueDate) {
      const dueInfo = getDueDateStatus(node.dueDate, Boolean(node.done), false);
      if (dueInfo) {
        const dueSpan = document.createElement("span");
        dueSpan.className = "apple-tag";
        dueSpan.style.background = dueInfo.bg;
        dueSpan.style.color = dueInfo.color;
        dueSpan.style.border = `1px solid ${dueInfo.border}`;
        dueSpan.style.cursor = "pointer";
        dueSpan.innerText = dueInfo.label;
        dueSpan.onclick = (e) => {
          e.stopPropagation();
          promptEditDueDate(node);
        };
        badges.appendChild(dueSpan);
      }
    }

    if (node.progress !== undefined && node.progress !== null && node.progress !== "") {
      const prg = document.createElement("span");
      prg.className = "outliner-progress-pill";
      const pNum = parseInt(node.progress, 10) || 0;
      const pColor = pNum <= 0 ? "#64748b"
                   : pNum <= 25 ? "#0071e3"
                   : pNum <= 50 ? "#d97706"
                   : pNum <= 75 ? "#9333ea"
                   : pNum < 100 ? "#0284c7"
                   : "#16a34a";
      const pBg = pNum <= 0 ? "rgba(100, 116, 139, 0.12)"
                : pNum <= 25 ? "rgba(0, 113, 227, 0.1)"
                : pNum <= 50 ? "rgba(245, 158, 11, 0.12)"
                : pNum <= 75 ? "rgba(175, 82, 222, 0.12)"
                : pNum < 100 ? "rgba(48, 176, 199, 0.12)"
                : "rgba(52, 199, 89, 0.14)";
      prg.style.color = pColor;
      prg.style.background = pBg;
      prg.innerText = node.progress;
      badges.appendChild(prg);
    }

    const textDiv = row.querySelector(".outliner-text-input");
    if (document.activeElement !== textDiv) {
      textDiv.innerText = node.text || "";
    }

    textDiv.onfocus = () => {
      if (ctx) ctx.selectNode(node.id);
      Array.from(listContainer.children).forEach(r => r.classList.toggle("selected", r.dataset.id === node.id));
    };

    textDiv.onblur = () => {
      if (isComposingIME) return;
      const val = textDiv.innerText.trim();
      // 🌟 防线 1：若节点未输入任何文字且无子节点（如回车新建后直接失焦），彻底移除该空节点，杜绝隐形幽灵节点
      if (!val && (!node.children || node.children.length === 0)) {
        const curIdx = parentNode.children ? parentNode.children.findIndex(c => c.id === node.id) : -1;
        if (curIdx !== -1) {
          executeCommand({
            type: COMMANDS.REMOVE_NODE,
            nodeId: node.id,
            oldParentId: parentNode.id,
            oldIndex: curIdx,
            oldNode: node
          });
          if (ctx) {
            ctx.markLayoutDirty(parentNode.id);
            const fallbackNode = parentNode.children[Math.max(0, curIdx - 1)] || parentNode;
            ctx.selectNode(fallbackNode.id);
          }
          renderOutliner(renderAppRef);
          bus.emit(EVENTS.RENDER_APP);
          return;
        }
      }
      if (val !== node.text) {
        executeCommand({
          type: COMMANDS.SET_TEXT,
          nodeId: node.id,
          oldText: node.text,
          newText: val || "新主题"
        });
      }
    };

    textDiv.onkeydown = (e) => {
      if (isComposingIME || e.isComposing || e.keyCode === 229) return;
      const curIdx = parentNode.children.findIndex(c => c.id === node.id);

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // 🌟 防线 2：若当前行本身就是末梢空白节点，拦截连续回车，禁止空节点链式繁殖
        if (!textDiv.innerText.trim() && (!node.children || node.children.length === 0)) {
          return;
        }
        const newSibling = {
          id: "node_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
          text: "",
          children: []
        };
        executeCommand({
          type: COMMANDS.INSERT_NODE,
          parentId: parentNode.id,
          index: curIdx + 1,
          node: newSibling
        });
        pendingFocusNodeId = newSibling.id;
        if (ctx) ctx.selectNode(newSibling.id);
        renderOutliner(renderAppRef);
        return;
      }

      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        if (curIdx > 0) {
          const prevSibling = parentNode.children[curIdx - 1];
          const subCommands = [{
            type: COMMANDS.MOVE_NODE,
            nodeId: node.id,
            fromParentId: parentNode.id,
            toParentId: prevSibling.id,
            fromIndex: curIdx,
            toIndex: prevSibling.children ? prevSibling.children.length : 0
          }];

          syncMigratedNodeStyles(node, prevSibling, ctx?.layoutStructure, ctx?.focusedRootId);

          const progressCmds = handleNodesMigrationTodoProgress(parentNode, prevSibling, [node]);
          subCommands.push(...progressCmds);

          if (subCommands.length === 1) executeCommand(subCommands[0]);
          else executeCompoundCommand(subCommands);

          prevSibling.collapsed = false;
          if (ctx) {
            ctx.markLayoutDirty(parentNode.id);
            ctx.markLayoutDirty(prevSibling.id);
          }
          pendingFocusNodeId = node.id;
          renderOutliner(renderAppRef);
          bus.emit(EVENTS.RENDER_APP);
        }
        return;
      }

      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        if (ctx && parentNode.id !== ctx.mindData.id) {
          const grandParent = findParent(parentNode.id, ctx.mindData);
          if (grandParent) {
            const pIdx = grandParent.children.findIndex(c => c.id === parentNode.id);
            const subCommands = [{
              type: COMMANDS.MOVE_NODE,
              nodeId: node.id,
              fromParentId: parentNode.id,
              toParentId: grandParent.id,
              fromIndex: curIdx,
              toIndex: pIdx + 1
            }];

            syncMigratedNodeStyles(node, grandParent, ctx?.layoutStructure, ctx?.focusedRootId);

            const progressCmds = handleNodesMigrationTodoProgress(parentNode, grandParent, [node]);
            subCommands.push(...progressCmds);

            if (subCommands.length === 1) executeCommand(subCommands[0]);
            else executeCompoundCommand(subCommands);

            if (ctx) {
              ctx.markLayoutDirty(parentNode.id);
              ctx.markLayoutDirty(grandParent.id);
            }
            pendingFocusNodeId = node.id;
            renderOutliner(renderAppRef);
            bus.emit(EVENTS.RENDER_APP);
          }
        }
        return;
      }

      if ((e.key === "Backspace" || e.key === "Delete") && textDiv.innerText.trim() === "" && (!node.children || node.children.length === 0)) {
        e.preventDefault();
        const prevNodeId = curIdx > 0 ? parentNode.children[curIdx - 1].id : parentNode.id;
        const subCommands = [{
          type: COMMANDS.REMOVE_NODE,
          nodeId: node.id,
          oldParentId: parentNode.id,
          oldIndex: curIdx,
          oldNode: node
        }];

        // 🌟 大纲删除子项联动清算父级待办
        const remainingChildren = (parentNode.children || []).filter(c => c.id !== node.id);
        const todoChildren = remainingChildren.filter(c => c.todo);
        let newPrg = null;
        if (todoChildren.length > 0) {
          const doneCount = todoChildren.filter(c => c.done).length;
          const pct = Math.round((doneCount / todoChildren.length) * 100);
          newPrg = `${pct}%`;
        }
        if (parentNode.progress !== newPrg) {
          subCommands.push({
            type: COMMANDS.UPDATE_ATTRS,
            nodeId: parentNode.id,
            oldAttrs: { progress: parentNode.progress || null },
            newAttrs: { progress: newPrg }
          });
          if (ctx) ctx.markLayoutDirty(parentNode.id);
        }

        if (subCommands.length === 1) executeCommand(subCommands[0]);
        else executeCompoundCommand(subCommands);

        pendingFocusNodeId = prevNodeId;
        if (ctx) ctx.selectNode(prevNodeId);
        renderOutliner(renderAppRef);
        return;
      }

      if (e.key === "ArrowUp") {
        const rows = Array.from(listContainer.querySelectorAll(".outliner-row"));
        const idx = rows.indexOf(row);
        if (idx > 0) {
          e.preventDefault();
          rows[idx - 1].querySelector(".outliner-text-input")?.focus();
        }
      } else if (e.key === "ArrowDown") {
        const rows = Array.from(listContainer.querySelectorAll(".outliner-row"));
        const idx = rows.indexOf(row);
        if (idx < rows.length - 1) {
          e.preventDefault();
          rows[idx + 1].querySelector(".outliner-text-input")?.focus();
        }
      }
    };

    const noteTag = row.querySelector(".outliner-note-indicator");
    if (node.note) {
      noteTag.classList.remove("hidden");
      noteTag.onclick = (e) => {
        e.stopPropagation();
        openNotesDrawer(node);
      };
    } else {
      noteTag.classList.add("hidden");
    }

    if (listContainer.children[itemIdx] !== row) {
      listContainer.insertBefore(row, listContainer.children[itemIdx] || null);
    }
  });
}
