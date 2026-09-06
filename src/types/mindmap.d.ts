/**
 * YMind Pro - 核心领域模型 TypeScript 类型定义
 */

export type PriorityLevel = 'P1' | 'P2' | 'P3' | 'P4' | null;
export type ProgressLevel = '25%' | '50%' | '75%' | '100%' | string | null;
export type LayoutStructure = 'mindmap' | 'logic-right' | 'logic-left' | 'org-down';
export type LineStyle = 'curve' | 'rounded-ortho' | 'sharp-ortho' | 'straight' | 'arc-corner';
export type BoxStyle = 'squircle' | 'rect' | 'underline' | 'solid';
export type BranchDirection = 'left' | 'right' | 'down';

export interface BranchTheme {
  border: string;
  line: string;
  badge: string;
  bgLight?: string;
  solid?: string;
}

export interface RootTheme {
  bg: string;
  border: string;
  text: string;
}

export interface MindNode {
  id: string;
  text: string;
  icon?: string | null;
  priority?: PriorityLevel;
  progress?: ProgressLevel;
  tags?: string[];
  note?: string;
  collapsed?: boolean;
  fontSize?: string | null;
  fontWeight?: string | null;
  fontStyle?: string | null;
  textDecoration?: string | null;
  textColor?: string | null;
  children: MindNode[];

  // 几何计算缓存字段 (由布局引擎在运行时装配)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  contentWidth?: number;
  textWidth?: number;
  extraLeftWidth?: number;
  lineHeight?: number;
  lines?: string[];
  branchDirection?: BranchDirection;
  colorTheme?: BranchTheme;
  rootTheme?: RootTheme;
  treeWidth?: number;
  treeHeight?: number;
  treeMinX?: number;
  treeMaxX?: number;
  treeMinY?: number;
  treeMaxY?: number;
  _sizeSignature?: string;
  _unmasked?: boolean;
}

export type CommandType =
  | 'SET_TEXT'
  | 'INSERT_NODE'
  | 'REMOVE_NODE'
  | 'MOVE_NODE'
  | 'UPDATE_ATTRS'
  | 'UPDATE_CONFIG';

export interface UpdateConfigCommand {
  type: 'UPDATE_CONFIG';
  prop: string;
  oldVal: any;
  newVal: any;
}

export interface SetTextCommand {
  type: 'SET_TEXT';
  nodeId: string;
  oldText: string;
  newText: string;
}

export interface InsertNodeCommand {
  type: 'INSERT_NODE';
  parentId: string;
  index: number;
  node: MindNode;
}

export interface RemoveNodeCommand {
  type: 'REMOVE_NODE';
  nodeId: string;
  oldParentId?: string;
  oldIndex?: number;
  oldNode?: MindNode;
}

export interface MoveNodeCommand {
  type: 'MOVE_NODE';
  fromParentId: string;
  toParentId: string;
  fromIndex: number;
  toIndex: number;
}

export interface UpdateAttrsCommand {
  type: 'UPDATE_ATTRS';
  nodeId: string;
  oldAttrs: Partial<MindNode>;
  newAttrs: Partial<MindNode>;
}

export type HistoryCommand =
  | SetTextCommand
  | InsertNodeCommand
  | RemoveNodeCommand
  | MoveNodeCommand
  | UpdateAttrsCommand
  | UpdateConfigCommand;

export interface CommandHistoryRecord {
  type: 'COMMAND';
  payload: HistoryCommand;
}

export interface SnapshotHistoryRecord {
  type: 'SNAPSHOT';
  payload: MindNode;
}

export type HistoryRecord = CommandHistoryRecord | SnapshotHistoryRecord;

export interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

export interface VersionSnapshot {
  id: string;
  name: string;
  trigger: 'manual' | 'auto';
  timestamp: number;
  tabTitle: string;
  nodeCount: number;
  layoutStructure: LayoutStructure;
  colorPalette: string;
  lineStyle: LineStyle;
  boxStyle: BoxStyle;
  canvasBgColor: string;
  canvasBgPattern: string;
  mindData: MindNode;
}

export interface VaultPackage {
  format: string;
  cipher: string;
  kdf: string;
  timeCost?: number;
  memoryCost?: number;
  parallelism?: number;
  hint: string;
  salt: string;
  dekIv: string;
  wrappedDek: string;
  payloadIv: string;
  payloadCipher: string;
  timestamp: number;
}

export interface TabSession {
  id: string;
  title: string;
  filePath: string | null;
  isDirty: boolean;
  mindData: MindNode;
  selectedIds: Set<string>;
  focusedRootId: string;
  layoutStructure: LayoutStructure;
  nodeSpacing: 'compact' | 'normal' | 'loose';
  colorPalette: string;
  lineStyle: LineStyle;
  boxStyle: BoxStyle;
  canvasBgColor: string;
  canvasBgPattern: string;
  viewMode: 'mindmap' | 'outliner';
  camera: CameraTransform;
  historyStack: HistoryRecord[];
  historyIndex: number;
  spatialIndex?: any;
  versions: VersionSnapshot[];
  isEncrypted?: boolean;
  password?: string | null;
  passwordHint?: string;
  encryptedVault?: VaultPackage | null;
  _isLocked?: boolean;
}

export interface AppState {
  tabs: TabSession[];
  activeTabId: string | null;
  isZenMode: boolean;
  isRecallMode: boolean;
  isLayoutDirty: boolean;
  isInteracting: boolean;
  editingNodeId: string | null;
  clipboardBranch: MindNode | null;
}
