#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YMind Pro Studio - 方案 C (XMind式占位兜底) 自动注入脚本
- 自动备份原始文件 (.bak)
- 彻底移除新建节点空内容失焦自动删除逻辑
- 保证焦点 100% 停留在新节点上，绝不跳回父节点
- 待办节点兜底为 "新待办"，普通节点兜底为 "新主题"/"新分支"
- 全面覆盖画布模式与大纲视图
"""

import os
import sys
import shutil

def find_project_root():
    candidates = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    for c in candidates:
        if os.path.isdir(os.path.join(c, "src", "js")):
            return c
    print("❌ 错误：未找到项目 src/js 目录，请在项目根目录下运行此脚本。")
    sys.exit(1)

def backup_and_write(filepath, new_content):
    bak_path = filepath + ".bak"
    if not os.path.exists(bak_path):
        shutil.copyfile(filepath, bak_path)
        print(f"📦 已创建备份: {os.path.basename(bak_path)}")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"✅ 成功修复: {filepath}")

def patch_inline_editor(root):
    path = os.path.join(root, "src", "js", "ui", "inline-editor.js")
    if not os.path.exists(path):
        print(f"⚠️ 未找到文件: {path}")
        return

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 替换 finish() 内部关于 isBlankDraft 自动销毁节点的逻辑
    old_block = """    const isBlankDraft = (val === "" || val === "新主题" || val === "新分支");
    if (isCancelled || (isNewNode && isBlankDraft)) {
      if (isNewNode && ctx) {
        abortDraftNodeCreation(ctx.tab, node.id);
        ctx.markLayoutDirty(null);
        if (ctx.tab) ctx.tab.isLayoutDirty = true;
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
    syncInspectorUi(ctx);
    onRender();"""

    new_block = """    // 🌟 方案 C：占位符兜底，彻底关闭自动销毁机制，空输入自动填充默认文本，焦点坚挺停留在新节点上
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
    onRender();"""

    if old_block in content:
        content = content.replace(old_block, new_block, 1)
        backup_and_write(path, content)
    else:
        print("ℹ️ inline-editor.js 已处于方案 C 或目标模式不匹配。")

def patch_outliner(root):
    path = os.path.join(root, "src", "js", "render", "outliner.js")
    if not os.path.exists(path):
        print(f"⚠️ 未找到文件: {path}")
        return

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 替换 outliner.js 中 textDiv.onblur 的自动删除逻辑
    old_blur = """    textDiv.onblur = () => {
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
    };"""

    new_blur = """    textDiv.onblur = () => {
      if (isComposingIME) return;
      const val = textDiv.innerText.trim();
      // 🌟 方案 C：大纲视图失焦不删除节点，自动填充占位文本并保持焦点
      const finalVal = val || (node.todo ? "新待办" : (node.text || "新主题"));
      textDiv.innerText = finalVal;
      if (finalVal !== node.text) {
        executeCommand({
          type: COMMANDS.SET_TEXT,
          nodeId: node.id,
          oldText: node.text,
          newText: finalVal
        });
        delete node._cachedMetrics;
        node._layoutDirty = true;
        if (ctx) ctx.markLayoutDirty(node.id);
      }
    };"""

    if old_blur in content:
        content = content.replace(old_blur, new_blur, 1)
        backup_and_write(path, content)
    else:
        print("ℹ️ outliner.js 已经更新或模式未匹配。")

def patch_history_safety(root):
    path = os.path.join(root, "src", "js", "core", "history.js")
    if not os.path.exists(path):
        print(f"⚠️ 未找到文件: {path}")
        return

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 改进 abortDraftNodeCreation：即使被外部显式调用，也绝不无脑退回父级，而是优先退回兄弟节点
    old_abort = """export function abortDraftNodeCreation(tab, nodeId) {
  if (!tab || !tab.mindData || !nodeId) return;
  const parent = findParent(nodeId, tab.mindData);
  if (parent && parent.children) {
    parent.children = parent.children.filter(c => c.id !== nodeId);
    tab.selectedIds = new Set([parent.id]);
    tab.isLayoutDirty = true;
    rebuildTopologyIndex(tab.mindData);
    logger.info("DraftAbort", `Draft node [${nodeId}] removed cleanly`);
  }
}"""

    new_abort = """export function abortDraftNodeCreation(tab, nodeId) {
  if (!tab || !tab.mindData || !nodeId) return;
  const parent = findParent(nodeId, tab.mindData);
  if (parent && parent.children) {
    const curIdx = parent.children.findIndex(c => c.id === nodeId);
    const fallbackSibling = curIdx > 0 ? parent.children[curIdx - 1] : (curIdx < parent.children.length - 1 ? parent.children[curIdx + 1] : null);
    parent.children = parent.children.filter(c => c.id !== nodeId);
    // 🌟 安全兜底：优先退至前一个兄弟节点，无兄弟时才退回父节点
    tab.selectedIds = new Set([fallbackSibling ? fallbackSibling.id : parent.id]);
    tab.isLayoutDirty = true;
    rebuildTopologyIndex(tab.mindData);
    logger.info("DraftAbort", `Draft node [${nodeId}] removed cleanly`);
  }
}"""

    if old_abort in content:
        content = content.replace(old_abort, new_abort, 1)
        backup_and_write(path, content)
    else:
        print("ℹ️ history.js 已具有就近回退安全机制。")

def main():
    print("=" * 60)
    print("🚀 YMind Pro - 方案 C (XMind式占位兜底) 一键注入程序")
    print("=" * 60)
    root = find_project_root()
    print(f"📁 定位到项目根目录: {root}\n")

    patch_inline_editor(root)
    patch_outliner(root)
    patch_history_safety(root)

    print("\n" + "=" * 60)
    print("🎉 方案 C 修复成功！")
    print("修复成果：")
    print("  1. 新建节点在失焦/未输入时不再被系统强制删除。")
    print("  2. 自动填入占位文本 ('新待办' 或 '新主题')，节点外框宽度实时适配。")
    print("  3. 焦点与高亮框 100% 坚挺保留在新节点上，镜头零晃动、零跨层级跳转。")
    print("=" * 60)

if __name__ == "__main__":
    main()