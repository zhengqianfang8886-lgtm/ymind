#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YMind Pro - 任务耗时结构化与待办进度类型治理自动化脚本 (Step 2)
"""

import os
import sys
import shutil

def backup_file(filepath):
    bak_path = filepath + ".bak"
    if not os.path.exists(bak_path):
        shutil.copy2(filepath, bak_path)
        print(f"[Backup] 已备份: {bak_path}")

def update_file(filepath, search_str, replace_str, description=""):
    if not os.path.exists(filepath):
        print(f"[Error] 未找到目标文件: {filepath}", file=sys.stderr)
        return False
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    if replace_str in content:
        print(f"[Skip] {filepath} 已包含修改 ({description})，跳过")
        return True

    if search_str not in content:
        print(f"[Fail] 未能在 {filepath} 定位锚点 ({description})", file=sys.stderr)
        return False

    backup_file(filepath)
    new_content = content.replace(search_str, replace_str, 1)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    
    print(f"[Success] 成功更新: {filepath} ({description})")
    return True


def step1_duration_engine():
    fp = os.path.join("src", "js", "ui", "task-duration.js")
    
    # 增加分钟换算与标准格式化
    old_anchor = 'export function formatDurationText(raw) {'
    new_engine = '''/**
 * 🌟 核心算法：将任意自然输入换算为标准绝对分钟数 (Duration Minutes)
 * 1d = 8h = 480m (标准工时制)
 */
export function parseDurationToMinutes(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/\\s+/g, "");
  if (!s) return null;

  // 纯数字默认按分钟
  if (/^\\d+$/.test(s)) return parseInt(s, 10);

  // 天 (d / 天)
  const dMatch = s.match(/^([0-9.]+)(d|天)$/);
  if (dMatch) return Math.round(parseFloat(dMatch[1]) * 8 * 60);

  // 小时 (h / 小时 / hr / hrs)
  const hMatch = s.match(/^([0-9.]+)(h|小时|hr|hrs)$/);
  if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60);

  // 分钟 (m / 分钟 / min / mins)
  const mMatch = s.match(/^([0-9.]+)(m|分钟|min|mins)$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]));

  return null;
}

/**
 * 🌟 绝对分钟数标准输出展示
 */
export function formatMinutesToBadge(minutes) {
  if (typeof minutes !== "number" || isNaN(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 480 === 0) return `${minutes / 480}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  const hrs = (minutes / 60).toFixed(1).replace(/\\.0$/, "");
  return `${hrs}h`;
}

export function formatDurationText(raw) {'''
    ok1 = update_file(fp, old_anchor, new_engine, "task-duration.js 注入标准分钟换算引擎")

    # 改造保存逻辑，写入 durationMinutes 与标准化字符串
    old_save = '''    const rawVal = inputEl?.value?.trim() || "";
    const cleanVal = formatDurationText(rawVal);
    const docCtx = getActiveDocumentContext();

    docCtx?.executeCommand({
      type: COMMANDS.UPDATE_ATTRS,
      nodeId: node.id,
      oldAttrs: { duration: node.duration || null },
      newAttrs: { duration: cleanVal }
    });'''

    new_save = '''    const rawVal = inputEl?.value?.trim() || "";
    const mins = parseDurationToMinutes(rawVal);
    const cleanVal = mins ? formatMinutesToBadge(mins) : formatDurationText(rawVal);
    const docCtx = getActiveDocumentContext();

    docCtx?.executeCommand({
      type: COMMANDS.UPDATE_ATTRS,
      nodeId: node.id,
      oldAttrs: { 
        duration: node.duration || null,
        durationMinutes: node.durationMinutes || null
      },
      newAttrs: { 
        duration: cleanVal,
        durationMinutes: mins
      }
    });'''
    ok2 = update_file(fp, old_save, new_save, "promptEditDuration 保存时标准化分钟持久化")
    return ok1 and ok2


def step2_types_and_serializer():
    # 1. types.d.ts
    fp_types = os.path.join("src", "types.d.ts")
    t_old = '  duration?: string | null;'
    t_new = '  duration?: string | null;\n  durationMinutes?: number | null;'
    ok1 = update_file(fp_types, t_old, t_new, "types.d.ts 增加 durationMinutes 属性")

    # 2. serializer.js
    fp_serial = os.path.join("src", "js", "core", "serializer.js")
    s_old1 = '  const duration = data.duration || node.duration;\n  if (duration) out.duration = duration;'
    s_new1 = '''  const duration = data.duration || node.duration;
  if (duration) out.duration = duration;
  const durationMinutes = data.durationMinutes !== undefined ? data.durationMinutes : node.durationMinutes;
  if (typeof durationMinutes === "number") out.durationMinutes = durationMinutes;'''
    ok2 = update_file(fp_serial, s_old1, s_new1, "serializer.js compactMindNode 增加 durationMinutes")

    s_old2 = '    duration: data.duration || n.duration || null,'
    s_new2 = '''    duration: data.duration || n.duration || null,
    durationMinutes: (typeof data.durationMinutes === "number") ? data.durationMinutes : ((typeof n.durationMinutes === "number") ? n.durationMinutes : null),'''
    ok3 = update_file(fp_serial, s_old2, s_new2, "serializer.js normalizeMindNode 增加 durationMinutes")
    return ok1 and ok2 and ok3


def step3_inspector_duration():
    fp = os.path.join("src", "js", "ui", "inspector.js")
    i_import_old = 'import { promptEditDuration } from "./task-duration.js";'
    i_import_new = 'import { promptEditDuration, parseDurationToMinutes, formatMinutesToBadge } from "./task-duration.js";'
    ok1 = update_file(fp, i_import_old, i_import_new, "inspector.js 引入标准化耗时工具函数")

    old_dur_pill = '''    pill.onclick = (e) => {
      e.stopPropagation();
      const val = pill.dataset.dur;
      const ctx = getActiveDocumentContext();
      const primary = getPrimarySelectedNode() || ctx?.mindData;
      if (primary && ctx) {
        ctx.executeCommand({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: primary.id,
          oldAttrs: { duration: primary.duration || null },
          newAttrs: { duration: val }
        });'''
    new_dur_pill = '''    pill.onclick = (e) => {
      e.stopPropagation();
      const val = pill.dataset.dur;
      const mins = parseDurationToMinutes(val);
      const cleanVal = mins ? formatMinutesToBadge(mins) : val;
      const ctx = getActiveDocumentContext();
      const primary = getPrimarySelectedNode() || ctx?.mindData;
      if (primary && ctx) {
        ctx.executeCommand({
          type: COMMANDS.UPDATE_ATTRS,
          nodeId: primary.id,
          oldAttrs: { duration: primary.duration || null, durationMinutes: primary.durationMinutes || null },
          newAttrs: { duration: cleanVal, durationMinutes: mins }
        });'''
    ok2 = update_file(fp, old_dur_pill, new_dur_pill, "inspector.js 快捷预设按钮写入标准化耗时")
    return ok1 and ok2


def step4_layout_clean_side_effect():
    fp = os.path.join("src", "js", "geometry", "layout.js")
    # 消除 measureNodeSize 内部篡改 node.progress 的副作用，改为仅依据实际子节点计算展示所需宽度，不污染 node.progress
    old_side_effect = '''  // 🌟 待办进度自动聚合与自愈：若该节点拥有待办子项，以子项真实状态权威聚合为形如 "0/3" 的数量胶囊
  if (node.children && Array.isArray(node.children)) {
    const todoChildren = node.children.filter(c => c && c.todo);
    if (todoChildren.length > 0) {
      const doneCount = todoChildren.filter(c => c.done).length;
      const rollupStr = `${doneCount}/${todoChildren.length}`;
      if (node.progress !== rollupStr) {
        node.progress = rollupStr;
        delete node._cachedMetrics;
      }
    } else if (node.progress && String(node.progress).includes('/')) {
      node.progress = null;
      delete node._cachedMetrics;
    }
  }'''

    new_clean_effect = '''  // 🌟 仅提取纯只读的待办子项统计状态用于几何测量，严禁原地篡改 node.progress 业务实体
  node._todoCountStr = null;
  if (node.children && Array.isArray(node.children)) {
    const todoChildren = node.children.filter(c => c && c.todo);
    if (todoChildren.length > 0) {
      const doneCount = todoChildren.filter(c => c.done).length;
      node._todoCountStr = `${doneCount}/${todoChildren.length}`;
    }
  }'''
    ok = update_file(fp, old_side_effect, new_clean_effect, "layout.js 消除尺寸测量函数中的业务数据篡改副作用")
    return ok


def main():
    print("=" * 65)
    print("🚀 YMind Pro - 耗时结构化与待办进度类型治理升级 (Step 2)")
    print("=" * 65)

    if not os.path.exists("src"):
        print("[Error] 请在包含 src/ 的项目根目录下执行！", file=sys.stderr)
        sys.exit(1)

    steps = [
        ("任务耗时领域解析与格式化引擎", step1_duration_engine),
        ("数据模型与序列化持久层扩展", step2_types_and_serializer),
        ("检查器交互耗时标准化", step3_inspector_duration),
        ("消除纯几何测量函数副作用", step4_layout_clean_side_effect)
    ]

    all_ok = True
    for name, func in steps:
        print(f"\n▶ 正在执行 {name}...")
        if not func():
            all_ok = False
            print(f"[Warning] {name} 处理异常，请核对。")

    print("\n" + "=" * 65)
    if all_ok:
        print("✅ 升级已全部成功！")
        print("💡 效果说明：")
        print("  1. 任务耗时输入（如 90分钟、1.5h）在入库时自动标准化为 durationMinutes: 90。")
        print("  2. measureNodeSize 成为纯净的尺寸计算函数，不再背地里修改 node.progress。")
    else:
        print("⚠️ 存在未匹配条目，可根据自动生成的 .bak 备份回滚。")
    print("=" * 65)

if __name__ == "__main__":
    main()