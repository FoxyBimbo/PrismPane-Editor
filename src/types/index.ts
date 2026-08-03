// ============================================================
// PrismPane — Core TypeScript Interfaces & Types
// ============================================================

/** Supported Markdown block transformation targets */
export type BlockType =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'paragraph'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'codeBlock'
  | 'horizontalRule';

export type EditorDocumentType = 'markdown' | 'json' | 'text';

export type VisibleFilesMode =
  | 'markdown'
  | 'json'
  | 'markdown-json'
  | 'folders'
  | 'all';

/** A single document template definition */
export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
}

/** Theme definition for the editor and UI */
export interface EditorTheme {
  id: string;
  name: string;
  /** CSS class(es) applied to the editor surface */
  editorClassName: string;
  /** Base CodeMirror theme extension (imported dynamically or pre-registered) */
  baseTheme: 'oneDark' | 'custom';
  /** CSS custom properties for CodeMirror syntax tokens */
  colors: EditorThemeColors;
}

export interface EditorThemeColors {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  selectionMatch: string;
  selectionText: string;
  gutterBackground: string;
  gutterForeground: string;
  lineHighlight: string;
  /** Markdown-specific token colors */
  heading: string;
  heading1: string;
  heading2: string;
  heading3: string;
  bold: string;
  italic: string;
  boldItalic: string;
  link: string;
  linkText: string;
  code: string;
  codeBackground: string;
  blockquote: string;
  blockquoteBorder: string;
  list: string;
  hr: string;
  strikethrough: string;
  image: string;
  /** UI chrome colors */
  sidebarBackground: string;
  sidebarForeground: string;
  toolbarBackground: string;
  toolbarForeground: string;
  activeTab: string;
  inactiveTab: string;
  /** Tab state indicator colors */
  tabSavedColor: string;
  tabUnsavedColor: string;
  tabSavedText: string;
  tabUnsavedText: string;
}

export type IconPackageKey = 'off' | 'bootstrap' | 'lucide' | 'iconoir' | 'tabler' | 'material' | 'boxicons' | 'phosphor';

/** Application-level settings schema */
export interface AppSettings {
  themeId: string;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wordWrap: boolean;
  showLineNumbers: boolean;
  showActiveLine: boolean;
  spellCheck: boolean;
  autoSave: boolean;
  autoSaveIntervalMs: number;
  associateMdFiles: boolean;
  associateJsonFiles: boolean;
  showFileToolbar: boolean;
  showFormattingToolbar: boolean;
  showFolderTree: boolean;
  previewMode: 'edit' | 'split' | 'preview';
  zenMode: boolean;
  showZenModeHint: boolean;
  typewriterMode: boolean;
  showTypewriterModeHint: boolean;
  formatJsonOnOpen: boolean;
  jsonIndentSize: number;
  showJsonFoldGutter: boolean;
  enableMarkdownLint: boolean;
  markdownLintSeverity: 'warning' | 'error';
  enableJsonSchemaLint: boolean;
  jsonSchemaSeverity: 'warning' | 'error';
  enableLinkCheck: boolean;
  linkCheckSeverity: 'warning' | 'error';
  enableSecretScan: boolean;
  blockSaveOnSecrets: boolean;
  visibleFiles: VisibleFilesMode;
  showAllFiles: boolean;
  useFullPath: boolean;
  iconHelperJsonPackage: IconPackageKey;
  iconHelperMdPackage: IconPackageKey;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'neon-nebula',
  fontSize: 15,
  lineHeight: 1.6,
  tabSize: 2,
  wordWrap: true,
  showLineNumbers: true,
  showActiveLine: true,
  spellCheck: true,
  autoSave: false,
  autoSaveIntervalMs: 30000,
  associateMdFiles: false,
  associateJsonFiles: false,
  showFileToolbar: true,
  showFormattingToolbar: true,
  showFolderTree: true,
  previewMode: 'edit',
  zenMode: false,
  showZenModeHint: true,
  typewriterMode: false,
  showTypewriterModeHint: true,
  formatJsonOnOpen: true,
  jsonIndentSize: 2,
  showJsonFoldGutter: true,
  enableMarkdownLint: true,
  markdownLintSeverity: 'warning',
  enableJsonSchemaLint: true,
  jsonSchemaSeverity: 'warning',
  enableLinkCheck: true,
  linkCheckSeverity: 'warning',
  enableSecretScan: true,
  blockSaveOnSecrets: true,
  visibleFiles: 'markdown',
  showAllFiles: false,
  useFullPath: true,
  iconHelperJsonPackage: 'phosphor',
  iconHelperMdPackage: 'off',
};

/** File metadata for open tabs */
export interface FileEntry {
  path: string;
  name: string;
  isDirty: boolean;
  hasEverBeenSaved: boolean;
  lastSaved: Date | null;
}

/** Action payload for block-type toggling */
export interface BlockToggleAction {
  type: BlockType;
  /** The document line index (0-based) */
  lineNumber: number;
  /** Current text of the line before transformation */
  currentText: string;
}