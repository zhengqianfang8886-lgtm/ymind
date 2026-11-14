import { showToast, escapeHtml } from "./dialog.js";
import { COMMANDS } from "../core/history.js";
import { getActiveDocumentContext } from "../core/state.js";
import { bus, EVENTS } from "../core/event-bus.js";

/**
 * 规范化格式化自然语言耗时文本 (如 "2小时" -> "2h", "30分钟" -> "30m")
 */
export function formatDurationText(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/小时/g, "h").replace(/分钟/g, "m").replace(/秒/g, "s").replace(/天/g, "d");
  s = s.replace(/\s+/g, "");
  return s || null;
}

/**
 * 计算耗时胶囊样式配置 (Indigo 紫靛柔光体系)
 */
export function getDurationBadgeStyle(durationStr, isDone = false, isDark = false) {
  if (!durationStr) return null;
  const label = `⏱️ ${durationStr}`;

  if (isDone) {
    return {
      label: `✓ ${durationStr}`,
      color: isDark ? "#64748b" : "#94a3b8",
      bg: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"
    };
  }

  return {
    label,
    color: isDark ? "#a5b4fc" : "#5856d6",
    bg: isDark ? "rgba(129, 140, 248, 0.15)" : "rgba(88, 86, 214, 0.09)",
    border: isDark ? "rgba(129, 140, 248, 0.32)" : "rgba(88, 86, 214, 0.24)"
  };
}

/**
 * 呼出高定 Apple 风格耗时设置弹窗 (带常用预设药丸)
 */
export async function promptEditDuration(node) {
  if (!node) return;
  const overlay = document.getElementById("apple-system-dialog-overlay");
  if (!overlay) return;

  const currentDuration = node.duration || "";
  const quickPills = ["15m", "30m", "45m", "1h", "2h", "4h", "1d"];

  overlay.innerHTML = `
    <div class="apple-modal-card" style="width: 420px; max-width: 90vw; gap: 14px;">
      <div class="apple-modal-header" style="justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="modal-header-icon primary" style="background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); color: #4338ca; font-size: 18px;">⏱️</div>
          <div class="modal-title-wrap">
            <h3 class="apple-modal-title">设置任务预估耗时</h3>
            <span style="font-size: 11.5px; color: var(--text-tertiary);">为「${escapeHtml(node.text || "任务")}」分配时间规划</span>
          </div>
        </div>
        <button id="btn-dur-close-x" class="inspector-close-btn" style="width: 28px; height: 28px;">✕</button>
      </div>

      <div class="apple-modal-body" style="gap: 12px;">
        <div>
          <label style="font-size: 11.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 5px; display: block;">耗时时长</label>
          <input type="text" id="dur-modal-input" class="apple-modal-input" placeholder="输入如: 30m、2h、1.5天，或点击下方快捷选择..." value="${escapeHtml(currentDuration)}" autocomplete="off" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">⚡ 常用快捷时长</span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="dur-quick-pills">
            ${quickPills.map(p => `
              <button class="doc-action-btn dur-pill-btn" data-val="${p}" style="background: rgba(88, 86, 214, 0.08); color: var(--apple-indigo, #5856d6); font-weight: 600; border: 1px solid rgba(88, 86, 214, 0.22); border-radius: 6px; padding: 3px 9px; font-size: 11.5px; cursor: pointer;">
                ${p}
              </button>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="apple-modal-footer" style="justify-content: space-between; margin-top: 4px;">
        <button id="btn-dur-clear" class="modal-btn modal-btn-secondary ${currentDuration ? '' : 'hidden'}" style="color: var(--apple-red);">清除耗时</button>
        <div style="display: flex; gap: 8px; margin-left: auto;">
          <button id="btn-dur-cancel" class="modal-btn modal-btn-secondary">取消</button>
          <button id="btn-dur-save" class="modal-btn modal-btn-primary">保存耗时</button>
        </div>
      </div>
    </div>
  `;

  overlay.style.display = "flex";
  overlay.classList.remove("hidden");
  const inputEl = overlay.querySelector("#dur-modal-input");
  inputEl?.focus();
  inputEl?.select();

  const closeDialog = () => {
    overlay.style.display = "none";
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  };

  overlay.querySelector("#btn-dur-close-x")?.addEventListener("click", closeDialog);
  overlay.querySelector("#btn-dur-cancel")?.addEventListener("click", closeDialog);

  overlay.querySelectorAll(".dur-pill-btn").forEach(btn => {
    btn.onclick = () => {
      if (inputEl) inputEl.value = btn.dataset.val;
      inputEl?.focus();
    };
  });

  overlay.querySelector("#btn-dur-clear")?.addEventListener("click", () => {
    if (inputEl) inputEl.value = "";
    overlay.querySelector("#btn-dur-save")?.click();
  });

  overlay.querySelector("#btn-dur-save")?.addEventListener("click", () => {
    const rawVal = inputEl?.value?.trim() || "";
    const cleanVal = formatDurationText(rawVal);
    const docCtx = getActiveDocumentContext();

    docCtx?.executeCommand({
      type: COMMANDS.UPDATE_ATTRS,
      nodeId: node.id,
      oldAttrs: { duration: node.duration || null },
      newAttrs: { duration: cleanVal }
    });

    docCtx?.markLayoutDirty(node.id);
    bus.emit(EVENTS.RENDER_APP);
    closeDialog();
    showToast(cleanVal ? `⏱️ 任务预估耗时已设为「${cleanVal}」` : "⏱️ 已清除任务耗时");
  });

  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      overlay.querySelector("#btn-dur-save")?.click();
    } else if (e.key === "Escape") {
      closeDialog();
    }
  });
}

/**
 * 校验鼠标坐标是否点击了节点上的耗时徽章
 */
export function isClickOnDurationPill(node, clickWorldX, clickWorldY) {
  if (!node || !node.duration || !node._durationPillRect) return false;
  const { x, y, width, height } = node._durationPillRect;
  return clickWorldX >= x - 2 && clickWorldX <= x + width + 2 &&
         clickWorldY >= y - 2 && clickWorldY <= y + height + 2;
}
