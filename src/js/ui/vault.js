import { applyCanvasThemeToBody, syncInspectorUi } from "./inspector.js";
import { camera } from "../core/camera.js";
import { renderTabBar } from "../core/tab-manager.js";
import { state, getActiveTab, closeTab, saveSnapshot, sanitizeTreeForHistory } from "../core/state.js";
import { encryptMindPayload, decryptMindPayload, evaluatePasswordStrength } from "../storage/crypto.js";
import { showToast, appConfirm } from "./dialog.js";
import { bus, EVENTS } from "../core/event-bus.js";

let renderAppRef = null;

export function updateSecurityDockStatus() {
  const tab = getActiveTab();
  const btnSecurity = document.getElementById("btn-toggle-security");
  const txtStatus = document.getElementById("txt-security-status");
  if (!tab || !btnSecurity) return;

  if (tab.isEncrypted) {
    btnSecurity.classList.add("primary-action");
    if (txtStatus) txtStatus.innerText = tab._isLocked ? "已锁定" : "已保护";
    btnSecurity.title = tab._isLocked ? "导图已锁定，点击解锁" : "Argon2id + AES-256 保护中 (点击立即锁定)";
  } else {
    btnSecurity.classList.remove("primary-action");
    if (txtStatus) txtStatus.innerText = "加密";
    btnSecurity.title = "设置 AES-256 密码保险箱 (Alt+L)";
  }
}

export function openVaultSetModal() {
  const tab = getActiveTab();
  const modalSet = document.getElementById("apple-vault-set-modal");
  if (!tab || !modalSet) return;

  const passInput = modalSet.querySelector("#vault-set-pass");
  const passConfirm = modalSet.querySelector("#vault-set-pass-confirm");
  const passHint = modalSet.querySelector("#vault-set-hint");
  const btnDisable = modalSet.querySelector("#btn-vault-disable");
  const btnSaveSet = modalSet.querySelector("#btn-vault-set-save");

  // 🛡️ 绝不明文回显主访问密码到 DOM 节点
  if (passInput) passInput.value = "";
  if (passConfirm) passConfirm.value = "";
  if (passHint) passHint.value = tab.passwordHint || "";
  passInput?.dispatchEvent(new Event("input"));

  if (tab.isEncrypted) {
    btnDisable?.classList.remove("hidden");
    if (btnSaveSet) btnSaveSet.innerText = "更新保险箱密码";
  } else {
    btnDisable?.classList.add("hidden");
    if (btnSaveSet) btnSaveSet.innerText = "启用保险箱保护";
  }
  modalSet.classList.remove("hidden");
  passInput?.focus();
}

export function closeVaultSetModal() {
  const modalSet = document.getElementById("apple-vault-set-modal");
  if (modalSet) {
    modalSet.classList.add("hidden");
    const passInput = modalSet.querySelector("#vault-set-pass");
    const passConfirm = modalSet.querySelector("#vault-set-pass-confirm");
    if (passInput) passInput.value = "";
    if (passConfirm) passConfirm.value = "";
  }
}

async function handleSaveVaultSettings() {
  const tab = getActiveTab();
  if (tab?._isLocked) {
    showToast("⚠️ 导图当前处于锁定状态，禁止修改密码配置");
    return;
  }
  const modal = document.getElementById("apple-vault-set-modal");
  const p1 = modal.querySelector("#vault-set-pass")?.value || "";
  const p2 = modal.querySelector("#vault-set-pass-confirm")?.value || "";
  const hint = modal.querySelector("#vault-set-hint")?.value.trim() || "";
  const btnSaveSet = modal.querySelector("#btn-vault-set-save");

  if (!p1) { showToast("⚠️ 密码不能为空"); return; }
  if (p1 !== p2) { showToast("⚠️ 两次输入的密码不一致"); return; }

  if (btnSaveSet) {
    btnSaveSet.innerText = "⏳ 正在计算密钥...";
    btnSaveSet.disabled = true;
  }

  try {
    tab.isEncrypted = true;
    tab.password = p1;
    tab.passwordHint = hint;
    tab._isLocked = false;
    tab.versions = [];

    // 🌟 启用密码保险箱时，物理销毁本地数据库中该文档的所有历史明文快照
    try {
      const { idbDeleteSnapshotsByTarget } = await import("../storage/idb.js");
      await idbDeleteSnapshotsByTarget(tab.title, tab.filePath);
      // 🌟 同步物理擦除 LocalStorage 与历史会话，防止明文残留
      localStorage.removeItem("WORKSPACE_HOT_EXIT_SESSION_V1_SYNC");
    } catch {}

    const vault = await encryptMindPayload(tab.mindData, p1, hint);
    tab.encryptedVault = vault;
    tab.isDirty = true;

    saveSnapshot(tab);
    closeVaultSetModal();
    updateSecurityDockStatus();

    // 🌟 关键引导：如果当前加密的文档尚未落盘（草稿状态），强提示并引导另存为物理文件
    if (!tab.filePath) {
      showToast("🛡️ 已启用保险箱！请及时保存为本地文件以防意外丢失");
      setTimeout(async () => {
        const ok = await appConfirm({
          title: "建议立即保存保密文件",
          message: "检测到当前文档尚未保存为本地文件。保密草稿若未保存到硬盘，关闭软件时容易遗忘密码导致数据丢失。是否现在立即保存为文件？",
          confirmText: "立即保存",
          cancelText: "稍后手动保存"
        });
        if (ok) {
          const { performSave } = await import("./events.js");
          await performSave(tab);
        }
      }, 500);
    } else {
      showToast("🛡️ 已启用 Argon2id + AES-256 密码保险箱！");
    }

    if (typeof renderAppRef === "function") renderAppRef(); else bus.emit(EVENTS.RENDER_APP);
  } finally {
    if (btnSaveSet) {
      btnSaveSet.innerText = "启用保险箱保护";
      btnSaveSet.disabled = false;
    }
  }
}

function handleDisableVault() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.isEncrypted = false;
  tab.password = null;
  tab.passwordHint = "";
  tab.encryptedVault = null;
  tab._isLocked = false;
  tab.isDirty = true;

  saveSnapshot();
  closeVaultSetModal();
  updateSecurityDockStatus();
  if (typeof renderAppRef === "function") renderAppRef(); else bus.emit(EVENTS.RENDER_APP);
  showToast("🔓 已解除加密保护，导图恢复为标准明文存储");
}

/**
 * 🌟 深度脱水与全面锁屏（Zero-Leakage Lock Pipeline）
 */
export async function lockCurrentTab() {
  const tab = getActiveTab();
  if (!tab || !tab.isEncrypted) {
    openVaultSetModal();
    return;
  }

  // 1. 严格重加密封包，确保修改完整封存至密文中
  if (tab.mindData && !tab._isLocked) {
    if (tab.password) {
      try {
        tab.encryptedVault = await encryptMindPayload(tab.mindData, tab.password, tab.passwordHint || "");
      } catch (err) {
        showToast("⚠️ 加密暂存失败，已中止锁定以防数据丢失");
        return;
      }
    } else if (!tab.encryptedVault) {
      showToast("⚠️ 缺少加密凭证，已阻止锁定操作");
      return;
    }
  }

  // 2. 内存模型数据物理置换
  tab.mindData = { id: "root", text: "🔒 导图已锁定", children: [] };
  tab.password = null;
  tab.historyStack = [];
  tab.historyIndex = -1;
  delete tab.history;
  tab._isLocked = true;

  // 3. 【防线 1】：物理粉碎剪贴板
  state.clipboardBranch = null;
  state.clipboardBranches = null;

  // 4. 【防线 2】：大纲视图物理脱水
  try {
    const { clearOutlinerDOM } = await import("../render/outliner.js");
    clearOutlinerDOM();
  } catch {
    const outlinerContent = document.getElementById("outliner-content");
    if (outlinerContent) outlinerContent.innerHTML = "";
  }

  // 5. 【防线 3】：3D 抽认卡工坊模块变量物理置空
  try {
    const { clearCardDeck } = await import("./flashcards.js");
    clearCardDeck();
  } catch {}

  // 6. 【防线 4】：搜索组件与输入框物理脱敏
  try {
    const { closeSearch } = await import("./search.js");
    closeSearch();
    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = "";
  } catch {}

  // 7. 【防线 5】：备注抽屉与行内编辑器物理擦空
  try {
    const { closeNotesDrawer } = await import("./notes.js");
    closeNotesDrawer();
    const txtArea = document.getElementById("notes-textarea");
    if (txtArea) txtArea.value = "";
    const preview = document.getElementById("notes-preview-content");
    if (preview) preview.innerHTML = "";
  } catch {}

  const inlineEditor = document.getElementById("inline-editor");
  if (inlineEditor) {
    inlineEditor.value = "";
    inlineEditor.classList.add("hidden");
  }
  state.editingNodeId = null;

  // 8. 【防线 6】：清空 Canvas 画面与小地图显存帧缓冲
  const canvas = document.getElementById("canvas-main");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  const interactiveCanvas = document.getElementById("canvas-interactive");
  if (interactiveCanvas) {
    const ictx = interactiveCanvas.getContext("2d");
    if (ictx) ictx.clearRect(0, 0, interactiveCanvas.width, interactiveCanvas.height);
  }
  const minimap = document.getElementById("minimap-canvas");
  if (minimap) {
    const mctx = minimap.getContext("2d");
    if (mctx) mctx.clearRect(0, 0, minimap.width, minimap.height);
  }

  // 9. 隐藏中间操作岛和检查器，直接唤出居中解锁海报
  document.getElementById("node-action-dock")?.classList.add("hidden");
  document.getElementById("format-sidebar")?.classList.add("collapsed");

  showLockScreen(tab);
  updateSecurityDockStatus();
  renderTabBar();

  try {
    const { saveSessionImmediate } = await import("../storage/session.js");
    saveSessionImmediate();
  } catch {}
}

export function showLockScreen(tab) {
  const lockScreen = document.getElementById("canvas-vault-lock-screen");
  const posterTitle = document.getElementById("vault-poster-title");
  const posterHintBox = document.getElementById("vault-poster-hint-box");
  const txtPosterHint = document.getElementById("txt-vault-poster-hint");
  const posterPass = document.getElementById("vault-poster-password");
  const errorMsg = document.getElementById("vault-error-message");
  if (!lockScreen || !tab) return;

  tab._isLocked = true;
  if (posterTitle) posterTitle.innerText = `「${tab.title || "思维导图"}」受密码保护`;

  const hintText = tab.passwordHint || tab.encryptedVault?.hint;
  if (hintText) {
    if (txtPosterHint) txtPosterHint.innerText = hintText;
    posterHintBox?.classList.remove("hidden");
  } else {
    posterHintBox?.classList.add("hidden");
  }

  errorMsg?.classList.add("hidden");
  
  // 🌟 确保锁屏弹窗在最顶层且处于 flex 居中状态
  lockScreen.classList.remove("hidden");
  lockScreen.style.display = "flex";
  lockScreen.style.zIndex = "9500";

  // 隐藏顶部干扰操作条
  document.getElementById("node-action-dock")?.classList.add("hidden");

  if (posterPass) {
    posterPass.value = "";
    setTimeout(() => posterPass.focus(), 60);
  }
  updateSecurityDockStatus();
}

export function hideLockScreen() {
  const lockScreen = document.getElementById("canvas-vault-lock-screen");
  if (lockScreen) {
    lockScreen.classList.add("hidden");
    lockScreen.style.setProperty("display", "none", "important");
  }
  document.getElementById("node-action-dock")?.classList.remove("hidden");
}
export const hideLockScreenDOM = hideLockScreen;

export function initVaultManager(renderApp) {
  renderAppRef = renderApp;
  const modalSet = document.getElementById("apple-vault-set-modal");
  if (modalSet) {
    const passInput = modalSet.querySelector("#vault-set-pass");
    const meterFill = modalSet.querySelector("#vault-pass-meter-fill");
    const strengthText = modalSet.querySelector("#vault-pass-strength-text");

    passInput?.addEventListener("input", () => {
      const res = evaluatePasswordStrength(passInput.value);
      if (meterFill) { meterFill.style.width = res.width; meterFill.style.backgroundColor = res.color; }
      if (strengthText) { strengthText.innerText = res.label; strengthText.style.color = res.color; }
    });

    modalSet.querySelector("#btn-close-vault-set")?.addEventListener("click", closeVaultSetModal);
    modalSet.querySelector("#btn-vault-set-cancel")?.addEventListener("click", closeVaultSetModal);
    modalSet.querySelector("#btn-vault-set-save")?.addEventListener("click", handleSaveVaultSettings);
    modalSet.querySelector("#btn-vault-disable")?.addEventListener("click", handleDisableVault);
  }

  const btnSecurity = document.getElementById("btn-toggle-security");
  const posterBox = document.getElementById("vault-poster-box");
  const posterPass = document.getElementById("vault-poster-password");
  const btnPosterUnlock = document.getElementById("btn-vault-poster-unlock");
  const btnPosterClose = document.getElementById("btn-vault-poster-close");
  const btnPosterBack = document.getElementById("btn-vault-poster-back");
  const errorMsg = document.getElementById("vault-error-message");

  function handleReturnToHome() {
    hideLockScreen();
    bus.emit(EVENTS.SHOW_HOME);
  }

  async function handleCloseLockedDoc() {
    const curTab = getActiveTab();
    if (!curTab) return;
    const { closeTabWithConfirm } = await import("../core/tab-manager.js");
    await closeTabWithConfirm(curTab.id, renderAppRef, () => bus.emit(EVENTS.SHOW_HOME));
  }

  btnPosterClose?.addEventListener("click", handleCloseLockedDoc);
  btnPosterBack?.addEventListener("click", handleReturnToHome);

  btnSecurity?.addEventListener("click", () => {
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.isEncrypted && !tab._isLocked) {
      lockCurrentTab();
      return;
    }
    if (tab.isEncrypted && tab._isLocked) {
      showLockScreen(tab);
      return;
    }
    openVaultSetModal();
  });

  async function handleUnlockAttempt() {
    const tab = getActiveTab();
    if (!tab || !posterPass) return;
    const inputPass = posterPass.value || "";
    if (!inputPass) return;

    try {
      if (!tab.encryptedVault) throw new Error("NO_VAULT");

      btnPosterUnlock.innerText = "⏳";
      btnPosterUnlock.disabled = true;

      const decryptedData = await decryptMindPayload(tab.encryptedVault, inputPass);
      tab.mindData = decryptedData;
      tab.password = inputPass;
      tab.passwordHint = tab.encryptedVault.hint || "";
      tab._isLocked = false;
      tab.selectedIds = new Set([tab.mindData.id || "root"]);
      tab.focusedRootId = tab.mindData.id || "root";
      tab.historyStack = [{ type: "SNAPSHOT", payload: sanitizeTreeForHistory(tab.mindData) }];
      tab.historyIndex = 0;
      delete tab.history;

      btnPosterUnlock.innerText = "➔";
      btnPosterUnlock.disabled = false;
      
      // 🌟 标记布局更新并强制物理清除锁定层
      tab._isLocked = false;
      tab.isLayoutDirty = true;
      state.isLayoutDirty = true;
      hideLockScreen();

      showToast("🔓 验签成功，已解密展开导图！");
      
      renderTabBar();
      if (tab.spatialIndex) tab.spatialIndex.clear();
      if (typeof renderAppRef === "function") renderAppRef(); else bus.emit(EVENTS.RENDER_APP);
    } catch (err) {
      btnPosterUnlock.innerText = "➔";
      btnPosterUnlock.disabled = false;
      posterBox?.classList.remove("vault-shake-anim");
      void posterBox?.offsetWidth;
      posterBox?.classList.add("vault-shake-anim");

      let tip = "密码错误，请重新输入";
      if (err?.message === "UNSUPPORTED_ARGON2ID_ENV") {
        tip = "当前环境缺失 Argon2id 算子（请使用桌面端打开）";
      } else if (err?.message === "CORRUPT_PAYLOAD") {
        tip = "解密成功但数据包内容已损坏";
      } else if (err?.message === "EMPTY_PACKAGE") {
        tip = "加密数据包为空";
      }

      if (errorMsg) {
        errorMsg.innerText = tip;
        errorMsg.classList.remove("hidden");
      }
      posterPass.select();
    }
  }

  btnPosterUnlock?.addEventListener("click", handleUnlockAttempt);
  posterPass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleUnlockAttempt();
    else if (e.key === "Escape") handleReturnToHome();
    else errorMsg?.classList.add("hidden");
  });

  updateSecurityDockStatus();
}