import { bus, EVENTS } from "./event-bus.js";

const SETTINGS_KEY = "YMIND_PRO_GLOBAL_SETTINGS";
let cachedGlobalSettings = null;

export const APP_VERSION = "3.0.0";

export function getDefaultSettings() {
  return {
    fontEn: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Helvetica Neue\", sans-serif",
    fontZh: "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    layout: "mindmap",
    palette: "apple-classic",
    lineStyle: "curve",
    nodeSpacing: "normal",
    boxStyle: "squircle",
    canvasTheme: "studio-light",
    canvasBgColor: "studio-white",
    canvasBgPattern: "dots",
    focusFollowMode: "smooth",
    autoSaveInterval: "30",
    autoCheckUpdate: true,
    githubRepo: "secure-artifacts/ymind-tauri"
  };
}

export function getGlobalSettings() {
  if (cachedGlobalSettings) return cachedGlobalSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    cachedGlobalSettings = raw ? { ...getDefaultSettings(), ...JSON.parse(raw) } : getDefaultSettings();
  } catch {
    cachedGlobalSettings = getDefaultSettings();
  }
  // 自动迁移旧仓库配置至当前官方仓库
  if (cachedGlobalSettings && (cachedGlobalSettings.githubRepo === "lfw/ymind-tauri" || !cachedGlobalSettings.githubRepo)) {
    cachedGlobalSettings.githubRepo = "secure-artifacts/ymind-tauri";
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cachedGlobalSettings)); } catch {}
  }
  return cachedGlobalSettings;
}

export function saveGlobalSettings(s) {
  cachedGlobalSettings = { ...s };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  applyGlobalTypography(s);
  bus.emit(EVENTS.CONFIG_CHANGE, s);
}

export function applyGlobalTypography(s = getGlobalSettings()) {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.style.setProperty("--font-en", s.fontEn);
    document.documentElement.style.setProperty("--font-zh", s.fontZh);
  }
}

export function applyAppTheme(theme = getGlobalSettings().appTheme || "light") {
  let effective = theme;
  if (theme === "auto" || theme === "system") {
    effective = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", effective);
  document.body.setAttribute("data-theme", effective);
  
  // 更新顶栏与首页的主题切换按钮图标
  const isDark = effective === "dark";
  const btnTop = document.getElementById("btn-theme-toggle");
  if (btnTop) {
    btnTop.innerHTML = isDark
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    btnTop.title = isDark ? "切换为浅色明亮模式" : "切换为深色黑曜模式";
  }

  const iconHome = document.getElementById("txt-theme-icon-home");
  const labelHome = document.getElementById("txt-theme-label-home");
  if (iconHome) iconHome.innerText = isDark ? "☀️" : "🌙";
  if (labelHome) labelHome.innerText = isDark ? "浅色外观" : "深色外观";
}

if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const s = getGlobalSettings();
    if (s.appTheme === "auto" || s.appTheme === "system") applyAppTheme("auto");
  });
}
