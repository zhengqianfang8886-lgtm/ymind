#!/usr/bin/env python3
import os
import re

# =========================================================================
# 1. 修复 src/js/ui/notes.js: 补全兜底节点，确保无论何时点击都能无条件弹出抽屉
# =========================================================================
notes_js_path = "src/js/ui/notes.js"
if os.path.exists(notes_js_path):
    with open(notes_js_path, "r", encoding="utf-8") as f:
        code = f.read()

    # 替换 openNotesDrawer 逻辑：
    # 1. targetNode 增加根节点兜底，绝不提前 return
    # 2. 移除 hidden 的同时显式赋予 display: flex 与 z-index
    old_open_pattern = re.compile(
        r"export function openNotesDrawer\(node\)\s*\{[\s\S]*?drawer\.classList\.remove\(\"hidden\"\);[\s\S]*?\}"
    )

    new_open_fn = """export function openNotesDrawer(node) {
  const docCtx = getActiveDocumentContext();
  let targetNode = node || getPrimarySelectedNode() || docCtx?.mindData;
  if (!targetNode) {
    targetNode = docCtx?.mindData;
  }
  if (!targetNode) {
    showToast("💡 暂无可用节点进行备注");
    return;
  }

  flushPendingNote();
  activeNoteTabId = docCtx?.tabId || null;
  activeNoteNodeId = targetNode.id;
  committedNoteText = targetNode.note || "";

  const drawer = document.getElementById("notes-drawer");
  const title = document.getElementById("notes-drawer-title");
  const textarea = document.getElementById("notes-textarea");
  const preview = document.getElementById("notes-preview-content");
  if (!drawer || !textarea) return;

  if (title) title.innerText = (targetNode.icon ? targetNode.icon + " " : "") + (targetNode.text || "节点备注");
  textarea.value = targetNode.note || "";
  resetNoteHistory(textarea.value);

  if (preview) {
    preview.innerHTML = DOMPurify.sanitize(renderMarkdown(targetNode.note || ""));
    bindPreviewInteractions(preview);
  }
  updateNotesStats(targetNode.note || "");

  drawer.classList.remove("hidden");
  drawer.style.display = "flex";
  drawer.style.transform = "translateX(0)";

  // 默认进入编辑或预览模式
  const hasContent = Boolean(targetNode.note && targetNode.note.trim());
  if (hasContent) {
    document.getElementById("tab-notes-preview")?.click();
  } else {
    document.getElementById("tab-notes-edit")?.click();
  }
}"""

    if old_open_pattern.search(code):
        code = old_open_pattern.sub(new_open_fn, code)
        with open(notes_js_path, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"[已修复] {notes_js_path}: openNotesDrawer 容错及唤起逻辑重构完毕")
    else:
        print(f"[未匹配] {notes_js_path}，尝试精确定位替换 targetNode 判断")
        code = code.replace(
            'const targetNode = node || getPrimarySelectedNode();\n  if (!targetNode) {\n    showToast("💡 请先在画布或大纲中选中一个节点");\n    return;\n  }',
            'const docCtx = getActiveDocumentContext();\n  let targetNode = node || getPrimarySelectedNode() || docCtx?.mindData;\n  if (!targetNode) return;'
        )
        with open(notes_js_path, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"[已补充修复] {notes_js_path}")


# =========================================================================
# 2. 补全 CSS: 确保 #notes-drawer 具有最高优先级定位、层级和完整 Apple HIG 样式
# =========================================================================
workspace_css_path = "src/css/workspace.css"
if os.path.exists(workspace_css_path):
    with open(workspace_css_path, "r", encoding="utf-8") as f:
        css = f.read()

    notes_css = """
/* ==========================================================================
   📝 统一 Apple 原生 Markdown 备注抽屉 (Notes Drawer HIG)
   ========================================================================== */
.notes-drawer-panel {
  position: fixed !important;
  top: 44px !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 440px !important;
  max-width: 90vw !important;
  background: rgba(255, 255, 255, 0.95) !important;
  backdrop-filter: blur(36px) saturate(200%) !important;
  -webkit-backdrop-filter: blur(36px) saturate(200%) !important;
  border-left: 0.5px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: -10px 0 36px rgba(0, 0, 0, 0.08) !important;
  z-index: 8500 !important;
  display: flex !important;
  flex-direction: column !important;
  box-sizing: border-box !important;
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.notes-drawer-panel.hidden {
  display: none !important;
  transform: translateX(100%) !important;
  pointer-events: none !important;
}

[data-theme="dark"] .notes-drawer-panel {
  background: rgba(20, 25, 36, 0.95) !important;
  border-left-color: rgba(255, 255, 255, 0.1) !important;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.5) !important;
  color: #ffffff !important;
}

.notes-drawer-header {
  height: 48px;
  padding: 0 16px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
[data-theme="dark"] .notes-drawer-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.notes-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.notes-title-text {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.notes-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.notes-tab-group {
  display: inline-flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}
[data-theme="dark"] .notes-tab-group {
  background: rgba(255, 255, 255, 0.08);
}

.notes-tab-btn {
  padding: 4px 10px;
  border: none;
  background: transparent;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.notes-tab-btn.active {
  background: #ffffff;
  color: var(--apple-blue);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
[data-theme="dark"] .notes-tab-btn.active {
  background: #1e2638;
  color: #38bdf8;
}

.notes-clear-btn {
  background: transparent;
  border: none;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.12s;
}
.notes-clear-btn:hover {
  background: rgba(255, 59, 48, 0.08);
  color: var(--apple-red);
}

.notes-toolbar {
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
[data-theme="dark"] .notes-toolbar {
  background: rgba(255, 255, 255, 0.02);
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.note-tool-btn {
  height: 24px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  border-radius: 5px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.12s;
}
.note-tool-btn:hover {
  border-color: var(--apple-blue);
  color: var(--apple-blue);
}
[data-theme="dark"] .note-tool-btn {
  background: #1a2130;
  border-color: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

.note-tool-sep {
  width: 1px;
  height: 14px;
  background: rgba(0, 0, 0, 0.1);
  margin: 0 2px;
}

.notes-body-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.notes-editor-textarea {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: transparent;
  color: var(--text-primary);
  box-sizing: border-box;
}

.notes-preview-rendered {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text-primary);
  box-sizing: border-box;
}

.notes-stats-bar {
  height: 28px;
  padding: 0 14px;
  border-top: 0.5px solid rgba(0, 0, 0, 0.06);
  font-size: 10.5px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.02);
  flex-shrink: 0;
}
[data-theme="dark"] .notes-stats-bar {
  border-top-color: rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}
"""

    if ".notes-drawer-panel" not in css:
        css += "\n" + notes_css
        with open(workspace_css_path, "w", encoding="utf-8") as f:
            f.write(css)
        print(f"[已补全样式] {workspace_css_path}: 写入了 #notes-drawer 完整的绝对定位、毛玻璃与层级样式")
    else:
        print(f"[已存在] {workspace_css_path} 已包含抽屉样式")

print("\n[所有修复执行完成] 请刷新页面，再次点击顶栏“备注”按钮或按 Alt+N！")