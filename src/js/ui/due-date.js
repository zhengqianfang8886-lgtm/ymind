import { showToast, appPrompt } from "./dialog.js";
import { executeCommand, COMMANDS } from "../core/history.js";
import { getActiveDocumentContext } from "../core/state.js";
import { bus, EVENTS } from "../core/event-bus.js";

/**
 * 智能解析静态短日期或自然语言短语（今天、明天、后天、下周五、09-25 等）
 */
export function parseDueDate(dueDateStr) {
  if (!dueDateStr) return null;
  const s = String(dueDateStr).trim();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (s === "今天" || s.toLowerCase() === "today") {
    const padM = String(today.getMonth() + 1).padStart(2, "0");
    const padD = String(today.getDate()).padStart(2, "0");
    return { date: today, display: `${padM}-${padD}`, raw: s };
  }
  if (s === "明天" || s.toLowerCase() === "tomorrow") {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    const padM = String(d.getMonth() + 1).padStart(2, "0");
    const padD = String(d.getDate()).padStart(2, "0");
    return { date: d, display: `${padM}-${padD}`, raw: s };
  }
  if (s === "后天") {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    const padM = String(d.getMonth() + 1).padStart(2, "0");
    const padD = String(d.getDate()).padStart(2, "0");
    return { date: d, display: `${padM}-${padD}`, raw: s };
  }
  if (s === "大后天") {
    const d = new Date(today); d.setDate(d.getDate() + 3);
    const padM = String(d.getMonth() + 1).padStart(2, "0");
    const padD = String(d.getDate()).padStart(2, "0");
    return { date: d, display: `${padM}-${padD}`, raw: s };
  }

  const weekMap = { "周一": 1, "周二": 2, "周三": 3, "周四": 4, "周五": 5, "周六": 6, "周日": 7, "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4, "星期五": 5, "星期六": 6, "星期日": 7 };
  for (const [kw, dayOfWeek] of Object.entries(weekMap)) {
    if (s.includes(kw)) {
      const currentDay = today.getDay() || 7;
      let diff = dayOfWeek - currentDay;
      if (s.includes("下") || diff <= 0) diff += 7;
      const d = new Date(today); d.setDate(d.getDate() + diff);
      const padM = String(d.getMonth() + 1).padStart(2, "0");
      const padD = String(d.getDate()).padStart(2, "0");
      return { date: d, display: `${padM}-${padD}`, raw: s };
    }
  }

  // MM-DD
  const mmdd = s.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (mmdd) {
    const m = parseInt(mmdd[1], 10) - 1;
    const d = parseInt(mmdd[2], 10);
    const target = new Date(today.getFullYear(), m, d);
    const padM = String(m + 1).padStart(2, "0");
    const padD = String(d).padStart(2, "0");
    return { date: target, display: `${padM}-${padD}`, raw: s };
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    const target = new Date(y, m, d);
    const padM = String(m + 1).padStart(2, "0");
    const padD = String(d).padStart(2, "0");
    return { date: target, display: `${padM}-${padD}`, raw: s };
  }

  return { date: null, display: s, raw: s };
}

/**
 * 🌟 核心状态与色彩映射计算器
 */
export function getDueDateStatus(dueDateStr, isDone = false, isDark = false) {
  const parsed = parseDueDate(dueDateStr);
  if (!parsed) return null;

  // 1. 待办已打钩完成：自动变灰淡化
  if (isDone) {
    return {
      label: `✓ ${parsed.display}`,
      color: isDark ? "#64748b" : "#94a3b8",
      bg: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
      status: "done"
    };
  }

  if (!parsed.date) {
    return {
      label: `📅 ${parsed.display}`,
      color: isDark ? "#94a3b8" : "#64748b",
      bg: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(100, 116, 139, 0.08)",
      border: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(100, 116, 139, 0.2)",
      status: "normal"
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = parsed.date.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // 2. 已逾期且待办未打钩：警示淡红 (⚠️ 逾期 X 天)
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: `⚠️ 逾期 ${overdueDays} 天`,
      color: isDark ? "#ff453a" : "#dc2626",
      bg: isDark ? "rgba(255, 69, 58, 0.18)" : "rgba(254, 226, 226, 0.8)",
      border: isDark ? "rgba(255, 69, 58, 0.35)" : "rgba(239, 68, 68, 0.32)",
      status: "overdue"
    };
  }

  // 3. 距离今天 <= 24 小时：柔光暖橙 (⚡ 今天截止 / ⚡ 明天截止)
  if (diffDays === 0 || diffDays === 1) {
    const urgentText = diffDays === 0 ? "⚡ 今天截止" : "⚡ 明天截止";
    return {
      label: urgentText,
      color: isDark ? "#ff9f0a" : "#d97706",
      bg: isDark ? "rgba(255, 159, 10, 0.18)" : "rgba(254, 243, 199, 0.85)",
      border: isDark ? "rgba(255, 159, 10, 0.35)" : "rgba(245, 158, 11, 0.32)",
      status: "urgent"
    };
  }

  // 4. 距离今天 2~3 天：轻快青蓝提示
  if (diffDays <= 3) {
    return {
      label: `⏳ 剩 ${diffDays} 天`,
      color: isDark ? "#38bdf8" : "#0284c7",
      bg: isDark ? "rgba(56, 189, 248, 0.15)" : "rgba(224, 242, 254, 0.85)",
      border: isDark ? "rgba(56, 189, 248, 0.3)" : "rgba(14, 165, 233, 0.3)",
      status: "approaching"
    };
  }

  // 5. 距离今天 > 3 天：优雅灰蓝胶囊 (📅 09-25)
  return {
    label: `📅 ${parsed.display}`,
    color: isDark ? "#94a3b8" : "#475569",
    bg: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(100, 116, 139, 0.08)",
    border: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(100, 116, 139, 0.2)",
    status: "normal"
  };
}

/**
 * 呼出 Apple 风格轻量截止日期设定弹窗
 */
export async function promptEditDueDate(node) {
  if (!node) return;
  const currentDue = node.dueDate || "";
  const newDue = await appPrompt({
    title: "设置轻量截止日期",
    message: "支持自然短语（今天、明天、下周五）或短日期（09-25、2026-10-01），清空则移除",
    placeholder: "例如: 09-25 或 明天",
    defaultValue: currentDue
  });

  if (newDue === null || newDue === undefined) return;

  const docCtx = getActiveDocumentContext();
  const cleanVal = newDue.trim() || null;

  docCtx?.executeCommand({
    type: COMMANDS.UPDATE_ATTRS,
    nodeId: node.id,
    oldAttrs: { dueDate: node.dueDate || null },
    newAttrs: { dueDate: cleanVal }
  });

  docCtx?.markLayoutDirty(node.id);
  bus.emit(EVENTS.RENDER_APP);
  showToast(cleanVal ? `📅 截止时间已设为「${cleanVal}」` : "📅 已清除截止日期");
}

/**
 * 校验画布鼠标点击坐标是否命中截止日胶囊
 */
export function isClickOnDueDatePill(node, clickWorldX, clickWorldY) {
  if (!node || !node.dueDate || !node._duePillRect) return false;
  const { x, y, width, height } = node._duePillRect;
  return clickWorldX >= x - 2 && clickWorldX <= x + width + 2 &&
         clickWorldY >= y - 2 && clickWorldY <= y + height + 2;
}
