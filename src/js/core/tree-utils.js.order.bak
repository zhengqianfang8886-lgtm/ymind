/**
 * 🌟 通用高性能非递归树遍历生成器（支持按需跳过折叠分支）
 * @param {import('../../types').MindNode | null} root
 * @param {{ skipCollapsed?: boolean }} [options]
 * @returns {Generator<import('../../types').MindNode>}
 */
export function* walkTree(root, options = { skipCollapsed: false }) {
  if (!root || typeof root !== "object") return;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    yield node;
    if (node.children && Array.isArray(node.children) && (!options.skipCollapsed || !node.collapsed)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        if (node.children[i]) stack.push(node.children[i]);
      }
    }
  }
}

/**
 * @param {import('../../types').MindNode | null} node
 * @returns {number}
 */
export function countNodes(node) {
  if (!node) return 0;
  let count = 0;
  for (const _ of walkTree(node)) count++;
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
function verifyParentChild(parent, childId) {
  if (!parent || !parent.children || !Array.isArray(parent.children)) return false;
  const sId = String(childId);
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (c && String(c.id) === sId) return true;
  }
  return false;
}

function findParentRecursive(targetId, node) {
  if (!node || !node.children || !Array.isArray(node.children)) return null;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child && String(child.id) === targetId) return node;
    const res = findParentRecursive(targetId, child);
    if (res) return res;
  }
  return null;
}

function findNodeRecursive(targetId, node) {
  if (!node) return null;
  if (String(node.id) === targetId) return node;
  if (node.children && Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      const res = findNodeRecursive(targetId, node.children[i]);
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

  let idx = topologyIndexCache.get(node);
  if (!idx) idx = rebuildTopologyIndex(node);

  if (idx && idx.parentMap.has(targetId)) {
    const cachedParent = idx.parentMap.get(targetId);
    if (verifyParentChild(cachedParent, targetId)) {
      return cachedParent;
    }
    // 🌟 拓扑自愈：缓存与当前真实树结构产生撕裂，强制同步重建
    idx = rebuildTopologyIndex(node);
    if (idx && idx.parentMap.has(targetId)) {
      const freshParent = idx.parentMap.get(targetId);
      if (verifyParentChild(freshParent, targetId)) {
        return freshParent;
      }
    }
  }

  // 终极兜底防御：真实树递归遍历
  return findParentRecursive(targetId, node);
}

/**
 * @param {string} id
 * @param {import('../../types').MindNode | null} node
 * @returns {import('../../types').MindNode | null}
 */
export function findNode(id, node) {
  if (!node || id === undefined || id === null) return null;
  const targetId = String(id);
  if (String(node.id) === targetId) return node;

  let idx = topologyIndexCache.get(node);
  if (!idx) idx = rebuildTopologyIndex(node);

  if (idx && idx.nodeMap.has(targetId)) {
    const cachedNode = idx.nodeMap.get(targetId);
    const cachedParent = idx.parentMap.get(targetId);
    if (cachedParent && verifyParentChild(cachedParent, targetId)) {
      return cachedNode;
    }
    // 校验未通过时强制自愈重建
    idx = rebuildTopologyIndex(node);
    if (idx && idx.nodeMap.has(targetId)) {
      const freshNode = idx.nodeMap.get(targetId);
      const freshParent = idx.parentMap.get(targetId);
      if (String(freshNode.id) === String(node.id) || (freshParent && verifyParentChild(freshParent, targetId))) {
        return freshNode;
      }
    }
  }

  return findNodeRecursive(targetId, node);
}

export function getAncestors(targetId, node, path = []) {
  if (!node || targetId === undefined || targetId === null) return null;
  const sTargetId = String(targetId);

  let idx = topologyIndexCache.get(node);
  if (!idx) idx = rebuildTopologyIndex(node);

  if (idx && idx.nodeMap.has(sTargetId)) {
    const fullChain = [];
    const visited = new Set();
    let cur = idx.nodeMap.get(sTargetId);
    let valid = true;

    while (cur) {
      if (visited.has(String(cur.id))) {
        valid = false;
        break;
      }
      visited.add(String(cur.id));
      fullChain.unshift(cur);

      if (String(cur.id) === String(node.id)) break;

      const parent = idx.parentMap.get(String(cur.id));
      if (parent && verifyParentChild(parent, cur.id)) {
        cur = parent;
      } else {
        valid = false;
        break;
      }
    }

    if (valid && fullChain.length > 0 && String(fullChain[0].id) === String(node.id)) {
      return fullChain;
    }

    idx = rebuildTopologyIndex(node);
  }

  function collectAncestorsRecursive(curr, target, chain) {
    if (!curr) return null;
    const nextChain = [...chain, curr];
    if (String(curr.id) === target) return nextChain;
    if (curr.children && Array.isArray(curr.children)) {
      for (let i = 0; i < curr.children.length; i++) {
        const res = collectAncestorsRecursive(curr.children[i], target, nextChain);
        if (res) return res;
      }
    }
    return null;
  }

  return collectAncestorsRecursive(node, sTargetId, path);
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
    duration: node.duration || null,
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
