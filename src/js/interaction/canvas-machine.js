/**
 * 🌟 核心状态机：CanvasInteractionStateMachine
 * 形式化枚举 7 种互斥的画布交互输入状态，杜绝全局布尔位竞争与失焦死锁
 */
export const CanvasState = {
  IDLE: "IDLE",
  PANNING: "PANNING",
  DRAGGING_NODE: "DRAGGING_NODE",
  MARQUEE: "MARQUEE",
  EDITING: "EDITING",
  PEEK_RECALL: "PEEK_RECALL",
  ZOOMING: "ZOOMING",
  ANIMATING: "ANIMATING"
};

export class CanvasInteractionStateMachine {
  constructor() {
    this.state = CanvasState.IDLE;
    this.payload = null;
    this.subscribers = new Set();
  }

  getState() {
    return this.state;
  }

  is(state) {
    return this.state === state;
  }

  isInteracting() {
    return this.state !== CanvasState.IDLE;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  transition(nextState, payload = null) {
    const fromState = this.state;
    this.state = nextState;
    this.payload = payload;
    for (const fn of this.subscribers) {
      try {
        fn(nextState, fromState, payload);
      } catch (e) {
        console.error("[CanvasStateMachine] Listener error:", e);
      }
    }
  }

  reset() {
    this.transition(CanvasState.IDLE, null);
  }
}

export const canvasMachine = new CanvasInteractionStateMachine();
