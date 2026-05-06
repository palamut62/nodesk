export interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  borderStyle: 'none' | 'solid' | 'dashed';
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  wrapText?: boolean;
  float?: 'left' | 'right';
}

export interface FloatingImage {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  alt: string;
}

export interface HFZone {
  text: string;
  image?: string;
  imageHeight?: number;
  align?: 'left' | 'center' | 'right';
}

export interface HeaderFooter {
  left: HFZone;
  center: HFZone;
  right: HFZone;
  visible: boolean;
}

/* ─── Drawing ─────────────────────────────────────────────────────────────── */
export type DrawTool = 'pen' | 'highlight' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'eraser' | 'move';

interface DrawBase { id: string; color: string; width: number; opacity?: number; }
export interface PenOp       extends DrawBase { type: 'pen';       pts: number[]; }
export interface HighlightOp extends DrawBase { type: 'highlight'; pts: number[]; }
export interface EraserOp    extends DrawBase { type: 'eraser';    pts: number[]; }
export interface LineOp      extends DrawBase { type: 'line';  x1:number; y1:number; x2:number; y2:number; }
export interface ArrowOp     extends DrawBase { type: 'arrow'; x1:number; y1:number; x2:number; y2:number; }
export interface RectOp      extends DrawBase { type: 'rect';    x:number;  y:number;  w:number;  h:number; fill?: string; }
export interface EllipseOp   extends DrawBase { type: 'ellipse'; cx:number; cy:number; rx:number; ry:number; fill?: string; }
export type DrawOp = PenOp | HighlightOp | EraserOp | LineOp | ArrowOp | RectOp | EllipseOp;

/* ─── Folder ──────────────────────────────────────────────────────────────── */
export interface Folder {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

/* ─── Version History ─────────────────────────────────────────────────────── */
export interface VersionSnapshot {
  id: string;
  content: string;
  title: string;
  savedAt: string;
  label?: string;
}

/* ─── Audio Clips ─────────────────────────────────────────────────────────── */
export interface AudioClip {
  id: string;
  name: string;
  dataUrl: string;
  duration: number;
  createdAt: string;
}

/* ─── Kanban Status ───────────────────────────────────────────────────────── */
export type NoteStatus = 'todo' | 'in-progress' | 'done' | 'archived';

/* ─── Note ────────────────────────────────────────────────────────────────── */
export interface Note {
  id: string;
  title: string;
  content: string;
  textboxes: TextBox[];
  images: FloatingImage[];
  drawOps: DrawOp[];
  header: HeaderFooter;
  footer: HeaderFooter;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  folderId?: string;
  status?: NoteStatus;
  versionHistory?: VersionSnapshot[];
  audioClips?: AudioClip[];
  isPinned?: boolean;
  encrypted?: boolean;
  encryptedContent?: string;
  color?: string;
}

export type AppTheme =
  | 'light'
  | 'dark'
  | 'sepia'
  | 'apple-yellow'
  | 'dark-blue'
  | 'green-black';

export type PageSize = 'a4' | 'a5' | 'letter' | 'legal' | 'a3';
export type PageOrientation = 'portrait' | 'landscape';

export type Language = 'tr' | 'en';

export type SortBy = 'updatedAt' | 'createdAt' | 'title' | 'wordCount';
export type SortDir = 'desc' | 'asc';
export type AppView = 'editor' | 'kanban' | 'calendar';

export type PinnableActionId =
  | 'open-file'
  | 'save-txt'
  | 'save-md'
  | 'save-docx'
  | 'share'
  | 'print-preview'
  | 'print-pdf';

export interface AiPrompts {
  fixText: string;
  translate: string;
  summarize: string;
  chat: string;
  chatAllNotes: string;
}

export type AiProvider = 'openrouter' | 'nvidia' | 'groq';

export interface Settings {
  provider: AiProvider;
  openrouterApiKey: string;
  openrouterModel: string;
  nvidiaApiKey: string;
  nvidiaModel: string;
  groqApiKey: string;
  groqModel: string;
  backgroundPattern: 'none' | 'lines' | 'grid';
  theme: AppTheme;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  autoCorrect: boolean;
  language: Language;
  pinnedActions: PinnableActionId[];
  pageSize?: PageSize;
  pageOrientation?: PageOrientation;
  pageColor?: string;
  pageColumns?: 1 | 2 | 3;
  lineHeight?: number;
  sortBy?: SortBy;
  sortDir?: SortDir;
  currentView?: AppView;
  translateTarget?: string;
  aiPrompts?: Partial<AiPrompts>;
}
