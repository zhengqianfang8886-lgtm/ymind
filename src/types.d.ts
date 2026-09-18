export interface MindNode {
  id: string;
  text: string;
  icon?: string | null;
  priority?: "P1" | "P2" | "P3" | "P4" | null;
  progress?: string | null;
  tags?: string[];
  note?: string;
  collapsed?: boolean;
  fontSize?: string | null;
  fontWeight?: string | null;
  fontStyle?: string | null;
  textDecoration?: string | null;
  textColor?: string | null;
  children?: MindNode[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  contentWidth?: number;
  extraLeftWidth?: number;
  textWidth?: number;
  lines?: string[];
  lineHeight?: number;
  treeMinX?: number;
  treeMaxX?: number;
  treeMinY?: number;
  treeMaxY?: number;
  treeWidth?: number;
  treeHeight?: number;
  branchDirection?: "left" | "right" | "down";
  paletteKey?: string;
  colorTheme?: any;
  rootTheme?: any;
  _sizeSignature?: string;
  _unmasked?: boolean;
}

export interface HistoryCommand {
  type: string;
  nodeId?: string;
  oldText?: string;
  newText?: string;
  parentId?: string;
  oldParentId?: string;
  fromParentId?: string;
  toParentId?: string;
  index?: number;
  oldIndex?: number;
  fromIndex?: number;
  toIndex?: number;
  node?: MindNode;
  oldNode?: MindNode;
  prop?: string;
  oldVal?: any;
  newVal?: any;
  oldAttrs?: Record<string, any>;
  newAttrs?: Record<string, any>;
  commands?: HistoryCommand[];
}

export interface HistorySnapshotEntry {
  tree: MindNode;
  selectedIds?: string[];
  targetNodeId?: string;
  actionLabel?: string;
  focusedRootId?: string;
  timestamp?: number;
  type?: string;
  payload?: any;
  _rawJson?: string;
}

export interface DocumentTab {
  id: string;
  title: string;
  filePath: string | null;
  isDirty: boolean;
  isLayoutDirty?: boolean;
  isRecallMode?: boolean;
  mindData: MindNode | null;
  selectedIds: Set<string>;
  focusedRootId: string;
  layoutStructure: string;
  nodeSpacing?: string;
  colorPalette: string;
  lineStyle: string;
  boxStyle: string;
  canvasBgColor: string;
  canvasBgPattern: string;
  viewMode: string;
  camera: { x: number; y: number; scale: number };
  historyStack: Array<HistorySnapshotEntry>;
  historyIndex: number;
  spatialIndex: any;
  versions: any[];
  isEncrypted?: boolean;
  password?: string | null;
  passwordHint?: string;
  encryptedVault?: any;
  _isLocked?: boolean;
  _skipAnimation?: boolean;
  _fileHandle?: any;
  _context?: any;
}

export interface DocumentContext {
  tabId: string;
  tab: DocumentTab;
  mindData: MindNode | null;
  spatialIndex: any;
  camera: { x: number; y: number; scale: number };
  isDirty: boolean;
  executeCommand: (cmd: HistoryCommand, apply?: boolean) => void;
  executeCompoundCommand: (cmds: HistoryCommand[], apply?: boolean) => void;
  saveSnapshot: () => void;
  undo: (cb?: () => void) => void;
  redo: (cb?: () => void) => void;
}
