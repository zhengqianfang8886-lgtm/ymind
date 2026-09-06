/**
 * @param {import('../../types').MindNode | null} node
 * @returns {number}
 */
export function countNodes(node) {
  if (!node) return 0;
  let count = 1;
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) count += countNodes(node.children[i]);
  }
  return count;
}

const topologyIndexCache = new WeakMap();

export function rebuildTopologyIndex(root) {
  if (!root || typeof root !== "object") return null;
  const nodeMap = new Map();
  const parentMap = new Map();
  const stack = [root];
  nodeMap.set(String(root.id), root);

  while (stack.length > 0) {
    const curr = stack.pop();
    if (curr.children && Array.isArray(curr.children)) {
      for (let i = 0; i < curr.children.length; i++) {
        const child = curr.children[i];
        if (child && child.id !== undefined) {
          nodeMap.set(String(child.id), child);
          parentMap.set(String(child.id), curr);
          stack.push(child);
        }
      }
    }
  }
  const index = { nodeMap, parentMap };
  topologyIndexCache.set(root, index);
  return index;
}

export function invalidateTopologyIndex(root) {
  if (root && typeof root === "object") topologyIndexCache.delete(root);
}

/**
 * @param {string} id
 * @param {import('../../types').MindNode | null} node
 * @returns {import('../../types').MindNode | null}
 */
export function findNode(id, node) {
  if (!node || id === undefined || id === null) return null;
  const targetId = String(id);
  const idx = topologyIndexCache.get(node) || rebuildTopologyIndex(node);
  if (idx && idx.nodeMap.has(targetId)) return idx.nodeMap.get(targetId);

  // 兜底防御：子树局部非根节点调用
  if (String(node.id) === targetId) return node;
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const res = findNode(targetId, node.children[i]);
      if (res) return res;
    }
  }
  return null;
}

/**
 * @param {string} id
 * @param {import('../../types').MindNode | null} node
 * @returns {import('../../types').MindNode | null}
 */
export function findParent(id, node) {
  if (!node || !node.children || id === undefined || id === null || String(node.id) === String(id)) return null;
  const targetId = String(id);
  const idx = topologyIndexCache.get(node) || rebuildTopologyIndex(node);
  if (idx && idx.parentMap.has(targetId)) return idx.parentMap.get(targetId);

  // 兜底防御
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (String(child.id) === targetId) return node;
    const res = findParent(targetId, child);
    if (res) return res;
  }
  return null;
}

export function getAncestors(targetId, node, path = []) {
  if (!node || targetId === undefined || targetId === null) return null;
  const sTargetId = String(targetId);
  const idx = topologyIndexCache.get(node) || rebuildTopologyIndex(node);
  if (idx && idx.nodeMap.has(sTargetId)) {
    const fullChain = [];
    let cur = idx.nodeMap.get(sTargetId);
    while (cur) {
      fullChain.unshift(cur);
      cur = idx.parentMap.get(String(cur.id)) || null;
    }
    return fullChain;
  }

  // 兜底防御
  if (String(node.id) === sTargetId) return [...path, node];
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const found = getAncestors(sTargetId, node.children[i], [...path, node]);
      if (found) return found;
    }
  }
  return null;
}

export function isNodeVisibleInTree(nodeId, root) {
  if (!nodeId || !root) return false;
  if (root.id === nodeId) return true;
  const path = getAncestors(nodeId, root);
  if (!path || path.length === 0) return false;
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i].collapsed) return false;
  }
  return true;
}

/**
 * @param {import('../../types').MindNode | null} node
 * @returns {import('../../types').MindNode | null}
 */
export function sanitizeTreeForHistory(node) {
  if (!node) return null;
  return {
    id: node.id,
    text: String(node.text ?? ""),
    icon: node.icon || null,
    priority: node.priority || null,
    progress: node.progress || null,
    tags: Array.isArray(node.tags) ? [...node.tags] : [],
    note: node.note || "",
    link: node.link || null,
    todo: Boolean(node.todo),
    done: Boolean(node.done),
    dueDate: node.dueDate || null,
    collapsed: Boolean(node.collapsed),
    fontSize: node.fontSize || null,
    fontWeight: node.fontWeight || null,
    fontStyle: node.fontStyle || null,
    textDecoration: node.textDecoration || null,
    textColor: node.textColor || null,
    branchDirection: node.branchDirection || null,
    children: node.children ? node.children.map(sanitizeTreeForHistory).filter(Boolean) : []
  };
}
