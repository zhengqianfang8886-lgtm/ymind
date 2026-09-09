// YMind Pro - 底层纯状态单例叶子模块 (彻底打破依赖闭环)
export const state = {
  tabs: [],
  activeTabId: null,
  isZenMode: false,
  editingNodeId: null,
  clipboardBranch: null,
  isLayoutDirty: false
};

export function getActiveTab() {
  if (!state.tabs || state.tabs.length === 0) return null;
  let tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) {
    tab = state.tabs[0];
    state.activeTabId = tab.id;
  }
  return tab;
}
