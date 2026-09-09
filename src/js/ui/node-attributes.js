import { state, getPrimarySelectedNode, getActiveDocumentContext, findNode, COMMANDS } from "../core/state.js";
import { syncInspectorUi } from "./inspector.js";
import { syncNotesDrawerWithActiveNode } from "./notes.js";
import { bus, EVENTS } from "../core/event-bus.js";

export function initNodeAttributeEvents(renderApp) {
  const btnAttr = document.getElementById("btn-node-attributes");
  const menuAttr = document.getElementById("menu-node-attributes");
  if (!btnAttr || !menuAttr) return;

  if (menuAttr.parentElement !== document.body) {
    document.body.appendChild(menuAttr);
  }
  menuAttr.classList.add("hidden");

  btnAttr.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = menuAttr.classList.contains("hidden");

    if (isHidden) {
      const rect = btnAttr.getBoundingClientRect();
      const menuWidth = 260;
      let leftPos = Math.round(rect.left + rect.width / 2 - menuWidth / 2);
      if (leftPos < 10) leftPos = 10;
      if (leftPos + menuWidth > window.innerWidth - 10) {
        leftPos = window.innerWidth - menuWidth - 10;
      }

      menuAttr.style.position = "fixed";
      menuAttr.style.top = `${Math.round(rect.bottom + 8)}px`;
      menuAttr.style.left = `${leftPos}px`;
      menuAttr.style.right = "auto";
      menuAttr.style.zIndex = "99999";
      menuAttr.classList.remove("hidden");
      btnAttr.classList.add("active");
    } else {
      menuAttr.classList.add("hidden");
      btnAttr.classList.remove("active");
    }
  });

  window.addEventListener("click", (e) => {
    if (!menuAttr.classList.contains("hidden")) {
      if (!menuAttr.contains(e.target) && !btnAttr.contains(e.target)) {
        menuAttr.classList.add("hidden");
        btnAttr.classList.remove("active");
      }
    }
  });

  // 快捷图标点选响应
  document.querySelectorAll("[data-quick-icon]").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      menuAttr.classList.add("hidden");
      btnAttr.classList.remove("active");
      const icon = chip.dataset.quickIcon;
      const docCtx = getActiveDocumentContext();
      const target = docCtx?.primarySelectedNode || getPrimarySelectedNode(docCtx);
      if (!target || !docCtx) return;

      docCtx.executeCommand({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: target.id,
        oldAttrs: { icon: target.icon || null },
        newAttrs: { icon: (target.icon === icon) ? null : icon }
      });

      docCtx.markLayoutDirty(target.id);
      bus.emit(EVENTS.RENDER_APP);
      syncNotesDrawerWithActiveNode(docCtx);
    });
  });

  document.getElementById("btn-open-full-icons")?.addEventListener("click", (e) => {
    e.stopPropagation();
    menuAttr.classList.add("hidden");
    btnAttr.classList.remove("active");
    const fs = document.getElementById("format-sidebar");
    const layout = document.querySelector(".workspace-body-layout");
    fs?.classList.remove("collapsed");
    document.getElementById("btn-toggle-format")?.classList.add("active");
    layout?.classList.add("sidebar-open");
    const iconSec = document.querySelector('.inspector-accordion-item[data-section="icons"]');
    if (iconSec) {
      iconSec.classList.add("open");
      iconSec.scrollIntoView({ behavior: "smooth" });
    }
  });

  // 优先级点选响应
  document.querySelectorAll("#menu-priority .popover-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      menuAttr.classList.add("hidden");
      btnAttr.classList.remove("active");
      const p = item.dataset.priority;
      const pVal = (p === "none") ? null : p;
      const docCtx = getActiveDocumentContext();
      const targetIds = (docCtx?.selectedIds && docCtx.selectedIds.size > 0)
        ? Array.from(docCtx.selectedIds)
        : [docCtx?.primarySelectedNode?.id].filter(Boolean);
      if (targetIds.length === 0 || !docCtx) return;

      docCtx.batchUpdateAttrs(targetIds, () => ({ priority: pVal }), true);
      syncInspectorUi(docCtx);
      bus.emit(EVENTS.RENDER_APP);
    });
  });

  // 进度点选响应
  document.querySelectorAll("#menu-progress .popover-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      menuAttr.classList.add("hidden");
      btnAttr.classList.remove("active");
      const prg = item.dataset.progress;
      const prgVal = (prg === "none") ? null : prg;
      const docCtx = getActiveDocumentContext();
      const targetIds = (docCtx?.selectedIds && docCtx.selectedIds.size > 0)
        ? Array.from(docCtx.selectedIds)
        : [docCtx?.primarySelectedNode?.id].filter(Boolean);
      if (targetIds.length === 0 || !docCtx) return;

      docCtx.batchUpdateAttrs(targetIds, () => ({ progress: prgVal }), true);
      syncInspectorUi(docCtx);
      bus.emit(EVENTS.RENDER_APP);
    });
  });

  // 标签管理器模态框
  const tagModal = document.getElementById("apple-modal-overlay");

  function renderTagModalList(node) {
    if (!tagModal) return;
    const tagList = tagModal.querySelector("#modal-tags-list");
    if (!tagList) return;

    const tags = Array.isArray(node.tags) ? node.tags : [];
    tagList.textContent = "";

    tags.forEach(t => {
      const tagStr = String(t);
      const tagSpan = document.createElement("span");
      tagSpan.className = "apple-modal-tag";

      const textSpan = document.createElement("span");
      textSpan.textContent = tagStr;

      const delSpan = document.createElement("span");
      delSpan.className = "tag-del-btn";
      delSpan.dataset.tag = tagStr;
      delSpan.style.cursor = "pointer";
      delSpan.style.fontWeight = "700";
      delSpan.textContent = "×";
      delSpan.onclick = (e) => {
        e.stopPropagation();
        const oldTags = [...(node.tags || [])];
        const newTags = oldTags.filter(item => item !== tagStr);
        const docCtx = getActiveDocumentContext();
        docCtx?.executeCommand({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: node.id,
          oldAttrs: { tags: oldTags },
          newAttrs: { tags: newTags }
        });
        docCtx?.markLayoutDirty(node.id);
        bus.emit(EVENTS.RENDER_APP);
        renderTagModalList(node);
      };

      tagSpan.appendChild(textSpan);
      tagSpan.appendChild(delSpan);
      tagList.appendChild(tagSpan);
    });
  }

  function addCurrentInputTag(node) {
    if (!tagModal) return;
    const tagInput = tagModal.querySelector("#modal-input");
    if (!tagInput) return;
    const val = tagInput.value.trim();
    if (!val) return;
    if (!Array.isArray(node.tags)) node.tags = [];
    const oldTags = [...(node.tags || [])];
    if (!oldTags.includes(val)) {
      const docCtx = getActiveDocumentContext();
      docCtx?.executeCommand({
        type: COMMANDS.UPDATE_ATTRS,
        nodeId: node.id,
        oldAttrs: { tags: oldTags },
        newAttrs: { tags: [...oldTags, val] }
      });
      docCtx?.markLayoutDirty(node.id);
      bus.emit(EVENTS.RENDER_APP);
      renderTagModalList(node);
    }
    tagInput.value = "";
    tagInput.focus();
  }

  document.getElementById("btn-open-tag-modal")?.addEventListener("click", (e) => {
    e.stopPropagation();
    menuAttr.classList.add("hidden");
    btnAttr.classList.remove("active");
    const node = getPrimarySelectedNode();
    if (!node || !tagModal) return;

    renderTagModalList(node);
    const tagInput = tagModal.querySelector("#modal-input");
    if (tagInput) tagInput.value = "";
    tagModal.classList.remove("hidden");
    tagInput?.focus();

    tagModal.querySelector("#modal-btn-cancel").onclick = () => tagModal.classList.add("hidden");
    tagModal.querySelector("#modal-btn-confirm").onclick = () => addCurrentInputTag(node);
    tagInput.onkeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addCurrentInputTag(node);
      } else if (ev.key === "Escape") {
        tagModal.classList.add("hidden");
      }
    };
  });
}
