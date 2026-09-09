// YMind Pro - 全局应用生命周期编排总线
import { applyAppTheme } from "./config.js";
import { isApplePlatform } from "../interaction/shortcuts.js";
import { restoreSession } from "../storage/session.js";
import { state, getActiveTab } from "./store.js";
import { camera } from "./camera.js";
import { applyCanvasThemeToBody, syncInspectorUi } from "../ui/inspector.js";
import { renderTabBar } from "./tab-manager.js";
import { bus, EVENTS } from "./event-bus.js";

export class Application {
  constructor() {
    this.initializers = [];
    this.isBootstrapped = false;
  }

  use(fn) {
    this.initializers.push(fn);
    return this;
  }

  async bootstrap(renderApp) {
    if (this.isBootstrapped) return;
    try {
      applyAppTheme();
      if (isApplePlatform()) {
        document.body.classList.add("platform-mac");
      }

      for (const initFn of this.initializers) {
        await initFn(renderApp);
      }

      const hasRestored = await restoreSession();
      if (hasRestored && state.tabs.length > 0) {
        const cur = getActiveTab();
        if (cur) {
          camera.transform = { ...cur.camera };
          applyCanvasThemeToBody(cur.canvasBgColor || "studio-white", cur.canvasBgPattern || "dots");
        }
        renderTabBar();
        syncInspectorUi();
      }

      this.isBootstrapped = true;
      bus.emit(EVENTS.SHOW_HOME);
    } catch (err) {
      console.error("[Application Bootstrap Failed]", err);
    }
  }
}

export const app = new Application();
