// ============================================================
// PrismPane — Application Shell (IndexedDB + Folder Tree + MenuBar)
// ============================================================

import { useState, useCallback, useRef, useEffect, useMemo, startTransition } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import Editor from './features/editor/Editor';
import Preview from './components/Preview';
import CommandPalette from './components/CommandPalette';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import TabBar from './components/TabBar';
import MenuBar from './components/MenuBar';
import type { MenuItem, MenuDef } from './components/MenuBar';
import SettingsPanel from './components/SettingsPanel';
import { IconSearchModal } from './components/IconSearchModal';
import { Modal } from './components/ui/Modal';
import type { SearchResult } from './components/SearchPanel';
import type { BlockType, EditorDocumentType, Template } from './types';
import { marked } from 'marked';
import { getThemeById, THEMES } from './features/editor/themes';
import { useSettings } from './hooks/useSettings';
import { TEMPLATES } from './features/formatters/templates';
import { buildFileTree, type FlatFileEntry, type TreeNode } from './components/FolderTree';
import {
  detectDocumentTypeFromContent,
  escapeHtml,
  getDocumentMimeType,
  getDocumentType,
  getExportBaseName,
  inferRenamedName,
  tryFormatJson,
} from './fileUtils';
import { initializeSchemaCatalogSync } from './services/schemaCatalog';
import { formatQualityIssueSummary, runQualityChecks, type QualityIssue } from './services/qualityChecks';
import { flattenAndSortProblems, mapEditorDiagnosticsToQualityIssues, type EditorDiagnosticPayload } from './services/problemMapping';
import {
  saveAllTabs,
  removeTab as removeTabFromDB,
  loadAllTabs,
  loadActiveTabId,
  saveOpenFolder,
  loadOpenFolder,
  getRecentFiles,
  addRecentFile,
  getRecentFolders,
  addRecentFolder,
  saveSidebarTab,
  loadSidebarTab,
  saveExpandedFolders,
  loadExpandedFolders
} from './hooks/useIndexedDB';
import type { PersistedTab } from './hooks/useIndexedDB';

// ─── Types ─────────────────────────────────────────────────

interface OpenFile {
  id: string;
  name: string;
  content: string;
  isDirty: boolean;
  hasEverBeenSaved: boolean;
  savedContent: string;
  filePath: string;
  cursorPos?: number;
}

type SidebarTab = 'files' | 'outline' | 'search' | 'problems';
type CommandPaletteMode = 'commands' | 'files';

interface CommandPaletteItem {
  label: string;
  action: () => void;
  shortcut?: string;
  description?: string;
}

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeFile(name: string, filePath: string, content: string): OpenFile {
  return {
    id: generateId(),
    name,
    content,
    isDirty: false,
    hasEverBeenSaved: filePath !== '',
    savedContent: content,
    filePath,
    cursorPos: 0,
  };
}

const OPEN_FILE_FILTERS = [
  { name: 'Supported Files', extensions: ['md', 'markdown', 'txt', 'json'] },
  { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
  { name: 'JSON', extensions: ['json'] },
];

function getFileIdentity(file: Pick<OpenFile, 'filePath' | 'name'>): string {
  return file.filePath || file.name;
}

function getOpenFileType(file: Pick<OpenFile, 'filePath' | 'name'>): EditorDocumentType {
  return getDocumentType(getFileIdentity(file));
}

function renameUntitledFileForDocumentType(fileName: string, documentType: EditorDocumentType): string {
  const match = fileName.match(/^(Untitled-\d+)\.(?:md|markdown|txt|json)$/i);
  if (!match) return fileName;

  return `${match[1]}.${documentType === 'json' ? 'json' : 'md'}`;
}

function getSaveDialogFilters(documentType: EditorDocumentType) {
  if (documentType === 'json') {
    return [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: 'Supported Files', extensions: ['md', 'markdown', 'txt', 'json'] },
    ];
  }

  return [
    { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
    { name: 'JSON', extensions: ['json'] },
    { name: 'Supported Files', extensions: ['md', 'markdown', 'txt', 'json'] },
  ];
}

async function renderDocumentBody(
  documentType: EditorDocumentType,
  content: string,
  jsonIndentSize: number,
): Promise<string> {
  if (documentType === 'json') {
    const formatted = tryFormatJson(content, jsonIndentSize) ?? content;
    return `<pre style="white-space: pre-wrap; word-break: break-word; padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.08); background: rgba(0, 0, 0, 0.03);">${escapeHtml(formatted)}</pre>`;
  }

  if (documentType === 'text') {
    return `<pre style="white-space: pre-wrap; word-break: break-word; padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.08); background: rgba(0, 0, 0, 0.03);">${escapeHtml(content)}</pre>`;
  }

  return await marked.parse(content);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveRealPathFromTreePath(rootPath: string | null, treePath: string): string {
  if (!rootPath) return treePath;

  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '');
  const rootName = normalizedRoot.split('/').filter(Boolean).pop() || '';
  const prefix = `/${rootName}/`;

  if (treePath.startsWith(prefix)) {
    return `${normalizedRoot}/${treePath.slice(prefix.length)}`;
  }

  if (treePath === `/${rootName}`) {
    return normalizedRoot;
  }

  return `${normalizedRoot}/${treePath.replace(/^\//, '')}`;
}

function getRelativeTreePath(treePath: string): string {
  return treePath.replace(/^\/[^/]+\/?/, '');
}

function collectFileNodes(nodes: TreeNode[], files: TreeNode[] = []): TreeNode[] {
  for (const node of nodes) {
    if (node.isDirectory && node.children) {
      collectFileNodes(node.children, files);
    } else if (!node.isDirectory) {
      files.push(node);
    }
  }

  return files;
}

const EMPTY_ISSUES: QualityIssue[] = [];

// ─── App ───────────────────────────────────────────────────

function App() {
  const { settings, updateSetting, resetSettings, isLoaded: settingsLoaded } = useSettings();
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteMode, setCommandPaletteMode] = useState<CommandPaletteMode>('commands');
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [untitledCounter, setUntitledCounter] = useState(1);
  const [tabsRestored, setTabsRestored] = useState(false);
  const [zenHintVisible, setZenHintVisible] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [typewriterHintVisible, setTypewriterHintVisible] = useState(false);
  const [typewriterDoNotShowAgain, setTypewriterDoNotShowAgain] = useState(false);
  const prevTypewriterMode = useRef(settings.typewriterMode);
  const isTypewriterInit = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveDiagnosticsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveDiagnosticsRunIdRef = useRef(0);
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;
  const activeFileIdRef = useRef(activeFileId);
  activeFileIdRef.current = activeFileId;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const cursorPositionsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (settings.zenMode && settings.showZenModeHint) {
      setZenHintVisible(true);
      setDoNotShowAgain(false);
    } else {
      setZenHintVisible(false);
    }
  }, [settings.zenMode, settings.showZenModeHint]);

  useEffect(() => {
    if (!settingsLoaded) return;
    
    if (!isTypewriterInit.current) {
      prevTypewriterMode.current = settings.typewriterMode;
      isTypewriterInit.current = true;
      return;
    }

    if (settings.typewriterMode !== prevTypewriterMode.current) {
      prevTypewriterMode.current = settings.typewriterMode;
      if (settings.showTypewriterModeHint) {
        setTypewriterHintVisible(true);
        setTypewriterDoNotShowAgain(false);
      }
    }
  }, [settings.typewriterMode, settings.showTypewriterModeHint, settingsLoaded]);

  // ─── Folder state ───────────────────────────────────────
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [folderTree, setFolderTree] = useState<TreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedTreeFolder, setSelectedTreeFolder] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files');
  const [searchPanelOpenToken, setSearchPanelOpenToken] = useState(0);
  const [iconSearchOpen, setIconSearchOpen] = useState(false);
  const [problemsByFile, setProblemsByFile] = useState<Record<string, QualityIssue[]>>({});
  const [editorProblemsByFile, setEditorProblemsByFile] = useState<Record<string, QualityIssue[]>>({});

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null;
  const activeDocumentType = useMemo<EditorDocumentType>(
    () => (activeFile ? getOpenFileType(activeFile) : 'markdown'),
    [activeFile],
  );
  const activeFileIdentity = activeFile ? getFileIdentity(activeFile) : null;
  const activeQualityIssues = useMemo(
    () => (activeFileIdentity ? (problemsByFile[activeFileIdentity] ?? EMPTY_ISSUES) : EMPTY_ISSUES),
    [activeFileIdentity, problemsByFile],
  );

  // ─── Restore tabs + open folder from IndexedDB ────────────
  useEffect(() => {
    let cancelled = false;
    // Restore the last session before rendering the main workspace.
    // Tabs, recent files, and the last folder all come back together here.
    Promise.all([loadAllTabs(), loadActiveTabId(), loadOpenFolder(), getRecentFiles(), getRecentFolders(), loadSidebarTab(), loadExpandedFolders()]).then(([persisted, savedActiveTabId, savedFolder, rFiles, rFolders, savedSidebarTab, savedExpandedFolders]) => {
      if (cancelled) return;
      setRecentFiles(rFiles);
      setRecentFolders(rFolders);
      if (savedSidebarTab) {
        setSidebarTab(savedSidebarTab as SidebarTab);
      }
      if (savedExpandedFolders.length > 0) {
        setExpandedFolders(new Set(savedExpandedFolders));
      }
      if (persisted.length > 0) {
        const files: OpenFile[] = persisted.map((p) => {
          if (p.cursorPos !== undefined) {
             cursorPositionsRef.current[p.id] = p.cursorPos;
          }
          return {
            id: p.id,
            name: p.name,
            content: p.content,
            isDirty: p.isDirty,
            hasEverBeenSaved: p.hasEverBeenSaved,
            savedContent: p.savedContent,
            filePath: p.filePath,
            cursorPos: p.cursorPos ?? 0,
          };
        });
        setOpenFiles(files);
        const restoredActiveFileId = savedActiveTabId && files.some((file) => file.id === savedActiveTabId)
          ? savedActiveTabId
          : files[0].id;
        setActiveFileId(restoredActiveFileId);
        let maxCounter = 1;
        for (const f of files) {
          const match = f.name.match(/^Untitled-(\d+)\.(?:md|markdown|txt|json)$/i);
          if (match) {
            const n = parseInt(match[1], 10);
            if (n >= maxCounter) maxCounter = n + 1;
          }
        }
        setUntitledCounter(maxCounter);
      }
      // Reopen the previously open folder
      if (savedFolder) {
        scanFolder(savedFolder);
      }
      setTabsRestored(true);
    });
    return () => { cancelled = true; };
  }, []);

  // ─── Persist to IndexedDB ───────────────────────────────
  const persistToDB = useCallback((files: OpenFile[], activeTabId: string | null = activeFileIdRef.current) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      const order = files.map((f) => f.id);
      const tabs: PersistedTab[] = files.map((f) => ({
        id: f.id,
        name: f.name,
        content: f.content,
        isDirty: f.isDirty,
        hasEverBeenSaved: f.hasEverBeenSaved,
        savedContent: f.savedContent,
        filePath: f.filePath,
        cursorPos: cursorPositionsRef.current[f.id] ?? f.cursorPos ?? 0,
      }));
      await saveAllTabs(order, tabs, activeTabId);
    }, 400);
  }, []);

  useEffect(() => {
    if (!tabsRestored) return;
    persistToDB(openFiles, activeFileId);
  }, [activeFileId, openFiles, persistToDB, tabsRestored]);

  useEffect(() => {
    if (tabsRestored) {
      saveSidebarTab(sidebarTab);
    }
  }, [sidebarTab, tabsRestored]);

  useEffect(() => {
    if (tabsRestored) {
      saveExpandedFolders(Array.from(expandedFolders));
    }
  }, [expandedFolders, tabsRestored]);

  // ─── Content change ─────────────────────────────────────
  const handleContentChange = useCallback((content: string) => {
    const activeId = activeFileIdRef.current;
    if (!activeId) return;

    startTransition(() => {
      setOpenFiles((prev) => {
        return prev.map((f) =>
          f.id === activeId
            ? { ...f, content, isDirty: content !== f.savedContent }
            : f,
        );
      });
    });

    // Clear any pending quality check and re-schedule so diagnostics
    // always eventually run, even without a word-boundary trigger.
    if (liveDiagnosticsTimerRef.current) {
      clearTimeout(liveDiagnosticsTimerRef.current);
    }

    const runId = ++liveDiagnosticsRunIdRef.current;
    liveDiagnosticsTimerRef.current = setTimeout(async () => {
      const activeFile = openFilesRef.current.find((c) => c.id === activeId);
      if (!activeFile) return;

      const issues = await runQualityChecks({
        fileIdentity: getFileIdentity(activeFile),
        filePath: activeFile.filePath || undefined,
        content: activeFile.content,
        documentType: getOpenFileType(activeFile),
        settings: settingsRef.current,
        phase: 'live',
      });

      if (runId !== liveDiagnosticsRunIdRef.current) return;

      startTransition(() => {
        setProblemsByFile((prevProblems) => ({
          ...prevProblems,
          [getFileIdentity(activeFile)]: issues,
        }));
      });
    }, 800);
  }, []);

  const handleRequestDiagnostics = useCallback(() => {
    const activeId = activeFileIdRef.current;
    if (!activeId) return;

    if (liveDiagnosticsTimerRef.current) {
      clearTimeout(liveDiagnosticsTimerRef.current);
    }

    const runId = ++liveDiagnosticsRunIdRef.current;
    liveDiagnosticsTimerRef.current = setTimeout(async () => {
      const activeFile = openFilesRef.current.find((c) => c.id === activeId);
      if (!activeFile) return;

      const issues = await runQualityChecks({
        fileIdentity: getFileIdentity(activeFile),
        filePath: activeFile.filePath || undefined,
        content: activeFile.content,
        documentType: getOpenFileType(activeFile),
        settings: settingsRef.current,
        phase: 'live',
      });

      if (runId !== liveDiagnosticsRunIdRef.current) return;

      startTransition(() => {
        setProblemsByFile((prevProblems) => ({
          ...prevProblems,
          [getFileIdentity(activeFile)]: issues,
        }));
      });
    }, 800);
  }, []);

  const handleEditorPaste = useCallback((pastedText: string) => {
    if (!pastedText.trim()) return;

    const detectedDocumentType = detectDocumentTypeFromContent(pastedText);

    setOpenFiles((prev) => {
      const activeId = activeFileIdRef.current;
      if (!activeId) return prev;

      let didChange = false;
      const updated = prev.map((file) => {
        if (file.id !== activeId) return file;
        if (file.hasEverBeenSaved || file.filePath || file.content.trim().length > 0) return file;

        const nextName = renameUntitledFileForDocumentType(file.name, detectedDocumentType);
        if (nextName === file.name) return file;

        didChange = true;
        return { ...file, name: nextName };
      });

      if (!didChange) return prev;

      persistToDB(updated);
      return updated;
    });
  }, [persistToDB]);

  // ─── New file ────────────────────────────────────────────
  const handleNewFile = useCallback(() => {
    const name = `Untitled-${untitledCounter}.md`;
    const newFile = makeFile(name, '', '');
    setOpenFiles((prev) => {
      const updated = [...prev, newFile];
      persistToDB(updated);
      return updated;
    });
    setActiveFileId(newFile.id);
    setUntitledCounter((c) => c + 1);
    setShowSettings(false);
  }, [untitledCounter, persistToDB]);

  // ─── Open file ───────────────────────────────────────────
  const openFileByPath = useCallback(
    async (filePath: string) => {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const rawContent = await readTextFile(filePath);
        const documentType = getDocumentType(filePath);
        const content = documentType === 'json' && settings.formatJsonOnOpen
          ? tryFormatJson(rawContent, settings.jsonIndentSize) ?? rawContent
          : rawContent;
        const name = filePath.split(/[/\\]/).pop() ?? 'file';
        const newFile = makeFile(name, filePath, content);
        newFile.hasEverBeenSaved = true;
        setOpenFiles((prev) => {
          const filtered = prev.filter((f) => f.filePath !== filePath);
          const updated = [...filtered, newFile];
          persistToDB(updated);
          return updated;
        });
        setActiveFileId(newFile.id);
        
        addRecentFile(filePath);
        getRecentFiles().then(setRecentFiles);
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    },
    [persistToDB, settings.formatJsonOnOpen, settings.jsonIndentSize],
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: OPEN_FILE_FILTERS,
      });
      if (selected && typeof selected === 'string') {
        await openFileByPath(selected);
      }
    } catch {
      fileInputRef.current?.click();
    }
  }, [openFileByPath]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const rawContent = reader.result as string;
        const documentType = getDocumentType(file.name);
        const content = documentType === 'json' && settings.formatJsonOnOpen
          ? tryFormatJson(rawContent, settings.jsonIndentSize) ?? rawContent
          : rawContent;
        const newFile = makeFile(file.name, '', content);
        setOpenFiles((prev) => {
          const updated = [...prev, newFile];
          persistToDB(updated);
          return updated;
        });
        setActiveFileId(newFile.id);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [persistToDB, settings.formatJsonOnOpen, settings.jsonIndentSize],
  );

  // ─── Open folder ─────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select a folder containing Markdown or JSON files',
      });
      if (selected && typeof selected === 'string') {
        await scanFolder(selected);
      }
    } catch {
      // Browser fallback not supported for folder selection
    }
  }, []);

  // Refs to hold current state for use in callbacks
  const expandedFoldersRef = useRef(expandedFolders);
  expandedFoldersRef.current = expandedFolders;
  const folderPathRef = useRef(folderPath);
  folderPathRef.current = folderPath;

  const scanFolder = useCallback(async (rootPath: string, preserveExpanded = false) => {
    const prevExpanded = preserveExpanded ? new Set(expandedFoldersRef.current) : null;
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const entries: FlatFileEntry[] = [];
      const visited = new Set<string>();

      // Normalize root path to forward slashes to ensure consistent path matching across all depth levels
      const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '');

      // Walk the folder recursively and flatten the result into tree nodes.
      // Permission failures are skipped so one locked subfolder does not block the whole tree.
      const walk = async (dirPath: string) => {
        const normDir = dirPath.replace(/\\/g, '/').replace(/\/$/, '');
        if (visited.has(normDir)) return;
        visited.add(normDir);

        try {
          const children = await readDir(normDir);
          for (const child of children) {
            if (!child.name) continue;
            // Ignore system/junk directories to maintain performance and avoid scanning internal caches
            if (
              child.name === '.git' ||
              child.name === 'node_modules' ||
              child.name === '$RECYCLE.BIN' ||
              child.name === '.DS_Store'
            ) {
              continue;
            }

            const fullPath = `${normDir}/${child.name}`;
            if (child.isDirectory) {
              entries.push({ path: fullPath, isDirectory: true });
              await walk(fullPath);
            } else {
              entries.push({ path: fullPath, isDirectory: false });
            }
          }
        } catch (err) {
          console.warn(`[scanFolder] Permission denied or failed to read subfolder: ${normDir}`, err);
        }
      };

      await walk(normalizedRoot);
      // Remember this folder for next session
      saveOpenFolder(rootPath);
      addRecentFolder(rootPath);
      getRecentFolders().then(setRecentFolders);

      // Strip the rootPath prefix from all entries so the selected folder
      // becomes the tree root, not C:/ or /Users/...
      const rootName = normalizedRoot.split('/').filter(Boolean).pop() || rootPath;
      const prefix = `${normalizedRoot}/`;
      const relativeEntries: FlatFileEntry[] = entries.map((e) => {
        const normPath = e.path.replace(/\\/g, '/');
        const relPath = normPath.startsWith(prefix) ? normPath.slice(prefix.length) : normPath;
        return {
          ...e,
          path: '/' + rootName + '/' + relPath,
        };
      });

      const tree = buildFileTree(relativeEntries);
      setFolderPath(rootPath);
      setFolderTree(tree);

      if (prevExpanded) {
        setExpandedFolders(prevExpanded);
      } else {
        // Auto-expand the root folder node on initial open
        setExpandedFolders(new Set(['/' + rootName]));
      }

      // Start the native file watcher for this folder
      try {
        await invoke('watch_folder', { path: rootPath });
      } catch {
        // Non-Tauri environment (browser), watcher won't work
      }
    } catch (err) {
      console.error('Failed to scan folder:', err);
    }
  }, []);

  // Compute the resolved target directory for saving new files
  const getSaveDirectory = useCallback((): string | null => {
    if (!folderPath) return null;
    if (selectedTreeFolder) {
      // Translate tree path to real path using the same logic as Sidebar
      const rootName = folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
      const prefix = '/' + rootName + '/';
      if (selectedTreeFolder.startsWith(prefix)) {
        return folderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + selectedTreeFolder.slice(prefix.length);
      }
      if (selectedTreeFolder === '/' + rootName) {
        return folderPath;
      }
      return folderPath + '/' + selectedTreeFolder.replace(/^\//, '');
    }
    return folderPath;
  }, [folderPath, selectedTreeFolder]);

  const handleSelectFolder = useCallback((treePath: string | null) => {
    setSelectedTreeFolder(treePath);
  }, []);

  // ─── Close folder ─────────────────────────────────────────
  const handleCloseFolder = useCallback(() => {
    setFolderPath(null);
    setFolderTree([]);
    setExpandedFolders(new Set());
    setSelectedTreeFolder(null);
    saveOpenFolder(null);
    // Stop the file watcher
    try {
      invoke('stop_watching');
    } catch { /* non-Tauri environment */ }
  }, []);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandToPath = useCallback((treePath: string, expandSelf: boolean = false) => {
    if (!treePath) return;
    const parts = treePath.replace(/\\/g, '/').split('/').filter(Boolean);
    const pathsToExpand: string[] = [];
    let currentPath = '';
    const limit = expandSelf ? parts.length : parts.length - 1;
    for (let i = 0; i < limit; i++) {
      currentPath += '/' + parts[i];
      pathsToExpand.push(currentPath);
    }
    setExpandedFolders(prev => {
      const next = new Set(prev);
      pathsToExpand.forEach(p => next.add(p));
      return next;
    });
  }, []);

  const handleSearchResultClick = useCallback(async (result: SearchResult, options: { query: string; isRegex: boolean; matchCase: boolean }) => {
    if (!folderPath) return;

    // Search results can target folders, files, or specific matches inside a file.
    // Each branch restores the right tree state before handing control back to the editor.
    const resolveTreePath = (realPath: string): string | null => {
      const normReal = realPath.replace(/\\/g, '/');
      const normFolder = folderPath.replace(/\\/g, '/').replace(/\/$/, '');
      if (normReal.startsWith(normFolder)) {
        const rootName = normFolder.split('/').filter(Boolean).pop() || '';
        return '/' + rootName + normReal.slice(normFolder.length);
      }
      return null;
    };

    const treePath = resolveTreePath(result.filePath);

    if (result.type === 'folder') {
      if (treePath) {
        expandToPath(treePath, true);
        handleSelectFolder(treePath);
      }
    } else if (result.type === 'file') {
      await openFileByPath(result.filePath);
      if (treePath) {
        expandToPath(treePath);
      }
    } else if (result.type === 'content') {
      await openFileByPath(result.filePath);
      if (treePath) {
        expandToPath(treePath);
      }
      
      setTimeout(() => {
        const container = document.querySelector('[data-testid="codemirror-editor"]') as any;
        if (container) {
          if (result.line && container.scrollToLine) {
            container.scrollToLine(result.line);
          }
          if (container.openFindPanelWithQuery) {
            container.openFindPanelWithQuery(options.query, options.isRegex, options.matchCase);
          }
        }
      }, 300);
    }
  }, [folderPath, openFileByPath, handleSelectFolder, expandToPath]);

  const allProblems = useMemo(
    () => flattenAndSortProblems(editorProblemsByFile, problemsByFile),
    [editorProblemsByFile, problemsByFile],
  );

  const handleEditorDiagnosticsChange = useCallback((diagnostics: EditorDiagnosticPayload[]) => {
    const file = openFilesRef.current.find((candidate) => candidate.id === activeFileIdRef.current);
    if (!file) return;

    const key = getFileIdentity(file);
    const mapped = mapEditorDiagnosticsToQualityIssues(key, file.filePath || undefined, diagnostics);

    // Skip the state update (and the consequent re-render + allProblems recalc)
    // when the diagnostics haven't meaningfully changed.
    setEditorProblemsByFile((prev) => {
      const existing = prev[key];
      if (existing && existing.length === mapped.length && mapped.length === 0) return prev;
      if (
        existing &&
        existing.length === mapped.length &&
        existing.every((e, i) => e.message === mapped[i].message && e.line === mapped[i].line)
      ) {
        return prev;
      }
      return { ...prev, [key]: mapped };
    });
  }, []);

  // Run quality checks once when switching tabs (not on every settings change).
  useEffect(() => {
    if (!activeFileId) return;
    handleRequestDiagnostics();
  }, [activeFileId, handleRequestDiagnostics]);

  useEffect(() => {
    return () => {
      if (liveDiagnosticsTimerRef.current) {
        clearTimeout(liveDiagnosticsTimerRef.current);
      }
    };
  }, []);

  const handleProblemClick = useCallback(async (issue: QualityIssue) => {
    if (issue.filePath) {
      const matchingTab = openFilesRef.current.find((file) => file.filePath === issue.filePath);
      if (matchingTab) {
        setActiveFileId(matchingTab.id);
      } else {
        await openFileByPath(issue.filePath);
      }
    } else {
      const matchingTab = openFilesRef.current.find((f) => getFileIdentity(f) === issue.fileIdentity);
      if (matchingTab) {
        setActiveFileId(matchingTab.id);
      }
    }

    if (issue.line) {
      setTimeout(() => {
        const container = document.querySelector('[data-testid="codemirror-editor"]') as (HTMLDivElement & { scrollToLine?: (n: number, c?: number) => void }) | null;
        container?.scrollToLine?.(issue.line!, issue.column);
      }, 250);
    }
  }, [openFileByPath]);

  // ─── Save ────────────────────────────────────────────────
  const performSave = useCallback(
    async (file: OpenFile): Promise<boolean> => {
      const documentType = getOpenFileType(file);
      const mimeType = getDocumentMimeType(documentType);

      const qualityIssues = await runQualityChecks({
        fileIdentity: getFileIdentity(file),
        filePath: file.filePath || undefined,
        content: file.content,
        documentType,
        settings,
        phase: 'save',
      });
      setProblemsByFile((prev) => ({
        ...prev,
        [getFileIdentity(file)]: qualityIssues,
      }));

      const blockingIssues = qualityIssues.filter(
        (issue) => issue.severity === 'error',
      );

      if (blockingIssues.length > 0) {
        const message = `Save blocked due to quality checks configured as Block Save:\n\n${formatQualityIssueSummary(blockingIssues, 12)}`;
        try {
          const { message: showMessage } = await import('@tauri-apps/plugin-dialog');
          await showMessage(message, { title: 'Save blocked', kind: 'error' });
        } catch {
          window.alert(message);
        }
        setSidebarTab('problems');
        return false;
      }

      const warningIssues = qualityIssues.filter((issue) => issue.severity === 'warning');
      if (warningIssues.length > 0) {
        const summary = formatQualityIssueSummary(warningIssues);
        const prompt = `Quality checks found potential issues:\n\n${summary}\n\nContinue saving anyway?`;
        let shouldContinue = false;
        try {
          const { confirm } = await import('@tauri-apps/plugin-dialog');
          shouldContinue = await confirm(prompt, { title: 'Quality checks', kind: 'warning' });
        } catch {
          shouldContinue = window.confirm(prompt);
        }

        if (!shouldContinue) {
          setSidebarTab('problems');
          return false;
        }
      }

      try {
        if (file.filePath && !file.filePath.startsWith('untitled:') && !file.filePath.startsWith('local:')) {
          // Existing files are written back in place.
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(file.filePath, file.content);
          setOpenFiles((prev) => {
            const updated = prev.map((f) =>
              f.id === file.id
                ? { ...f, isDirty: false, hasEverBeenSaved: true, savedContent: f.content }
                : f,
            );
            persistToDB(updated);
            return updated;
          });
          return true;
        } else {
          const saveDir = getSaveDirectory();
          if (saveDir) {
            // New files inherit the currently selected folder when one is open.
            const dest = `${saveDir}/${file.name}`;
            const { writeTextFile } = await import('@tauri-apps/plugin-fs');
            await writeTextFile(dest, file.content);
            const newName = dest.split(/[/\\]/).pop() ?? file.name;
            setOpenFiles((prev) => {
              const updated = prev.map((f) =>
                f.id === file.id
                  ? { ...f, name: newName, filePath: dest, isDirty: false, hasEverBeenSaved: true, savedContent: f.content }
                  : f,
              );
              persistToDB(updated);
              return updated;
            });
            return true;
          } else {
            // No folder open, show save dialog
            const { save } = await import('@tauri-apps/plugin-dialog');
            const dest = await save({
              filters: getSaveDialogFilters(documentType),
              defaultPath: file.name,
            });
            if (dest) {
              const { writeTextFile } = await import('@tauri-apps/plugin-fs');
              await writeTextFile(dest, file.content);
              const newName = dest.split(/[/\\]/).pop() ?? file.name;
              setOpenFiles((prev) => {
                const updated = prev.map((f) =>
                  f.id === file.id
                    ? { ...f, name: newName, filePath: dest, isDirty: false, hasEverBeenSaved: true, savedContent: f.content }
                    : f,
                );
                persistToDB(updated);
                return updated;
              });
              return true;
            } else {
              const blob = new Blob([file.content], { type: mimeType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name;
              a.click();
              URL.revokeObjectURL(url);
              setOpenFiles((prev) => {
                const updated = prev.map((f) =>
                  f.id === file.id
                    ? { ...f, isDirty: false, hasEverBeenSaved: true, savedContent: f.content }
                    : f,
                );
                persistToDB(updated);
                return updated;
              });
              return true;
            }
          }
        }
      } catch (err) {
        console.error('Save failed:', err);
        const blob = new Blob([file.content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        setOpenFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === file.id
              ? { ...f, isDirty: false, hasEverBeenSaved: true, savedContent: f.content }
              : f,
          );
          persistToDB(updated);
          return updated;
        });
        return true;
      }
    },
    [persistToDB, getSaveDirectory, settings],
  );

  const handleSaveFile = useCallback(async () => {
    const file = openFiles.find((f) => f.id === activeFileId);
    if (!file) return;
    await performSave(file);
  }, [activeFileId, openFiles, performSave]);

  const handleSaveAs = useCallback(async () => {
    const file = openFiles.find((f) => f.id === activeFileId);
    if (!file) return;
    const documentType = getOpenFileType(file);
    const mimeType = getDocumentMimeType(documentType);

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const defaultDir = getSaveDirectory();
      const dest = await save({
        filters: getSaveDialogFilters(documentType),
        defaultPath: defaultDir ? `${defaultDir}/${file.name}` : file.name,
      });
      if (dest) {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(dest, file.content);
        const newName = dest.split(/[/\\]/).pop() ?? file.name;
        setOpenFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === file.id
              ? { ...f, name: newName, filePath: dest, isDirty: false, hasEverBeenSaved: true, savedContent: f.content }
              : f,
          );
          persistToDB(updated);
          return updated;
        });
      }
    } catch {
      // Browser fallback
      const blob = new Blob([file.content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [activeFileId, openFiles, persistToDB, getSaveDirectory]);

  const handleSaveAll = useCallback(async () => {
    for (const file of openFiles) {
      if (file.isDirty) await performSave(file);
    }
  }, [openFiles, performSave]);

  // ─── Close file ──────────────────────────────────────────
  const handleCloseFile = useCallback(
    (id: string) => {
      const removed = openFilesRef.current.find((file) => file.id === id);
      setOpenFiles((prev) => {
        const updated = prev.filter((f) => f.id !== id);
        persistToDB(updated);
        if (activeFileIdRef.current === id) {
          const idx = prev.findIndex((f) => f.id === id);
          const remaining = updated;
          const newActive =
            remaining.length > 0
              ? remaining[Math.min(idx, remaining.length - 1)].id
              : null;
          setActiveFileId(newActive);
        }
        return updated;
      });
      if (removed) {
        const removedIdentity = getFileIdentity(removed);
        setProblemsByFile((prev) => {
          const next = { ...prev };
          delete next[removedIdentity];
          return next;
        });
        setEditorProblemsByFile((prev) => {
          const next = { ...prev };
          delete next[removedIdentity];
          return next;
        });
      }
      removeTabFromDB(id);
    },
    [persistToDB],
  );

  // ─── Tab actions ─────────────────────────────────────────
  const handleFileSelect = useCallback((id: string) => {
    setActiveFileId(id);
    setShowSettings(false);
  }, []);

  const handleTabRename = useCallback(
    async (id: string, newName: string) => {
      const file = openFilesRef.current.find((f) => f.id === id);
      if (!file) return;

      const finalName = inferRenamedName(file.name, newName);

      if (file.filePath && !file.filePath.startsWith('untitled:') && !file.filePath.startsWith('local:')) {
        const oldPath = file.filePath;
        const isBackslash = oldPath.includes('\\');
        const separator = isBackslash ? '\\' : '/';
        const parts = oldPath.split(separator);
        parts.pop();
        parts.push(finalName);
        const newPath = parts.join(separator);
        
        if (oldPath !== newPath) {
          try {
            const { rename } = await import('@tauri-apps/plugin-fs');
            await rename(oldPath, newPath);
            setOpenFiles((prev) => {
              const updated = prev.map((f) => (f.id === id ? { ...f, name: finalName, filePath: newPath } : f));
              persistToDB(updated);
              return updated;
            });
          } catch (e) {
            console.error('Failed to rename file from tab:', e);
            // Fallback: just rename the tab
            setOpenFiles((prev) => {
              const updated = prev.map((f) => (f.id === id ? { ...f, name: finalName } : f));
              persistToDB(updated);
              return updated;
            });
          }
        }
      } else {
        setOpenFiles((prev) => {
          const updated = prev.map((f) => (f.id === id ? { ...f, name: finalName } : f));
          persistToDB(updated);
          return updated;
        });
      }
    },
    [persistToDB],
  );

  const handleFileRename = useCallback(
    async (oldPath: string, newName: string) => {
      const currentName = oldPath.split(/[/\\]/).pop() ?? 'file.md';
      const finalName = inferRenamedName(currentName, newName);
      
      const isBackslash = oldPath.includes('\\');
      const separator = isBackslash ? '\\' : '/';
      const parts = oldPath.split(separator);
      parts.pop();
      parts.push(finalName);
      const newPath = parts.join(separator);
      
      if (oldPath === newPath) return;

      try {
        const { rename } = await import('@tauri-apps/plugin-fs');
        await rename(oldPath, newPath);
        
        setOpenFiles((prev) => {
          const updated = prev.map((f) => {
            if (f.filePath && f.filePath.replace(/\\/g, '/') === oldPath.replace(/\\/g, '/')) {
              return { ...f, name: finalName, filePath: newPath };
            }
            return f;
          });
          persistToDB(updated);
          return updated;
        });
      } catch (e) {
        console.error('Failed to rename file from tree:', e);
      }
    },
    [persistToDB],
  );

  const handleFileAction = useCallback(async (action: 'saveAs' | 'exportPdf' | 'exportHtml' | 'print' | 'share' | 'duplicate', filePath: string) => {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      let content = '';
      
      const openFile = openFilesRef.current.find(f => f.filePath === filePath);
      if (openFile) {
        content = openFile.content;
      } else {
        content = await readTextFile(filePath);
      }
      
      const fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
      const fileBaseName = getExportBaseName(fileName);
      const documentType = getDocumentType(filePath || fileName);

      if (action === 'saveAs') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const dest = await save({
          filters: getSaveDialogFilters(documentType),
          defaultPath: fileName,
        });
        if (dest) {
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(dest, content);
        }
      } else if (action === 'duplicate') {
        const { copyFile } = await import('@tauri-apps/plugin-fs');
        const isBackslash = filePath.includes('\\');
        const separator = isBackslash ? '\\' : '/';
        const parts = filePath.split(separator);
        parts.pop();
        const extension = fileName.match(/(\.[^./\\]+)$/)?.[1] ?? '';
        parts.push(`${fileBaseName}-copy${extension}`);
        const newPath = parts.join(separator);
        await copyFile(filePath, newPath);
      } else if (action === 'exportHtml') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const dest = await save({
          filters: [{ name: 'HTML', extensions: ['html'] }],
          defaultPath: fileBaseName + '.html',
        });
        if (dest) {
  
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');
          const html = await renderDocumentBody(documentType, content, settings.jsonIndentSize);
          const boilerplate = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${fileBaseName}</title>\n</head>\n<body style="font-family: sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto;">\n${html}\n</body>\n</html>`;
          await writeTextFile(dest, boilerplate);
        }
      } else if (action === 'exportPdf') {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const dest = await save({
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          defaultPath: fileBaseName + '.pdf',
        });
        if (dest) {
          // Render the document into a temporary DOM node so html2pdf can capture it.
          const html = await renderDocumentBody(documentType, content, settings.jsonIndentSize);
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;
          wrapper.style.cssText = 'padding: 2rem; font-family: sans-serif;';
          document.body.appendChild(wrapper);
          
          // @ts-ignore
          const html2pdf = (await import('html2pdf.js')).default;
          
          const opt = {
            margin: 0.5,
            filename: fileBaseName + '.pdf',
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
          };
          
          await html2pdf().set(opt).from(wrapper).save(dest);
          document.body.removeChild(wrapper);
        }
      } else if (action === 'print') {

        const html = await renderDocumentBody(documentType, content, settings.jsonIndentSize);
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`<html><head><title>${fileBaseName}</title><style>body { font-family: sans-serif; padding: 2rem; }</style></head><body>${html}</body></html>`);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }
      } else if (action === 'share') {
        if (navigator.share) {
          await navigator.share({
            title: fileBaseName,
            text: content,
          });
        } else {
          await navigator.clipboard.writeText(content);
        }
      }
    } catch (e) {
      console.error(`Failed to perform ${action}:`, e);
    }
  }, [settings.jsonIndentSize]);

  const handleTabReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setOpenFiles((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        persistToDB(updated);
        return updated;
      });
    },
    [persistToDB],
  );

  // ─── Template select ─────────────────────────────────────
  const handleTemplateSelect = useCallback(
    (template: Template) => {
      const name = `${template.name.toLowerCase().replace(/\s+/g, '-')}.md`;
      const newFile = makeFile(name, '', template.content);
      setOpenFiles((prev) => {
        const updated = [...prev, newFile];
        persistToDB(updated);
        return updated;
      });
      setActiveFileId(newFile.id);
    },
    [persistToDB],
  );

  // ─── Block transform ─────────────────────────────────────
  const handleBlockTransform = useCallback((type: BlockType) => {
    if (activeDocumentType !== 'markdown') return;

    const container = document.querySelector('[data-testid="codemirror-editor"]') as
      | (HTMLDivElement & { applyBlockTransform?: (type: BlockType) => void })
      | null;
    container?.applyBlockTransform?.(type);
  }, [activeDocumentType]);

  // ─── Inline formatting (bold, italic, strikethrough) ──────
  const handleInlineFormat = useCallback((wrapper: string) => {
    if (activeDocumentType !== 'markdown') return;

    const container = document.querySelector('[data-testid="codemirror-editor"]') as
      | (HTMLDivElement & { toggleInlineFormatting?: (wrapper: string) => void })
      | null;
    container?.toggleInlineFormatting?.(wrapper);
  }, [activeDocumentType]);

  // ─── Search helpers ──────────────────────────────────────
  const editorCommand = useCallback(<K extends keyof HTMLElementTagNameMap>(cmd: string) => {
    const el = document.querySelector('[data-testid="codemirror-editor"]') as
      | (HTMLDivElement & Record<string, (() => void) | undefined>)
      | null;
    el?.[cmd]?.();
  }, []);

  const handleFind = useCallback(() => editorCommand('openFindPanel'), [editorCommand]);
  const handleFindNext = useCallback(() => editorCommand('findNext'), [editorCommand]);
  const handleFindPrevious = useCallback(() => editorCommand('findPrevious'), [editorCommand]);
  const handleReplace = useCallback(() => editorCommand('openReplacePanel'), [editorCommand]);

  const handleInsertTime = useCallback(() => editorCommand('insertTime'), [editorCommand]);
  const handleInsertDate = useCallback(() => editorCommand('insertDate'), [editorCommand]);
  const handleInsertTimestamp = useCallback(() => editorCommand('insertTimestamp'), [editorCommand]);
  const handleCopyAsHtml = useCallback(() => {
    if (activeDocumentType !== 'markdown') return;
    editorCommand('copyAsHtml');
  }, [editorCommand, activeDocumentType]);
  const handlePasteFromHtml = useCallback(() => {
    if (activeDocumentType !== 'markdown') return;
    editorCommand('pasteFromHtml');
  }, [editorCommand, activeDocumentType]);
  const handleDuplicateLine = useCallback(() => editorCommand('duplicateLine'), [editorCommand]);
  const handleMoveLineUp = useCallback(() => editorCommand('moveLineUp'), [editorCommand]);
  const handleMoveLineDown = useCallback(() => editorCommand('moveLineDown'), [editorCommand]);
  const handleTransformCase = useCallback(() => editorCommand('transformCase'), [editorCommand]);
  const handleGenerateTOC = useCallback(() => {
    if (activeDocumentType !== 'markdown') return;
    editorCommand('generateTOC');
  }, [editorCommand, activeDocumentType]);
  const handleFormatJson = useCallback(() => {
    if (activeDocumentType !== 'json') return;
    editorCommand('formatDocument');
  }, [editorCommand, activeDocumentType]);

  const handleNavigateToLine = useCallback((lineNum: number) => {
    const el = document.querySelector('[data-testid="codemirror-editor"]') as (HTMLDivElement & { scrollToLine?: (n: number) => void }) | null;
    el?.scrollToLine?.(lineNum);
  }, []);

  const handleGoToLine = useCallback(() => {
    const input = window.prompt('Go to line:', '');
    if (!input) return;

    const lineNumber = Number.parseInt(input.trim(), 10);
    if (Number.isFinite(lineNumber) && lineNumber > 0) {
      handleNavigateToLine(lineNumber);
    }
  }, [handleNavigateToLine]);

  const handleToggleSidebar = useCallback(() => {
    updateSetting('showFolderTree', !settings.showFolderTree);
  }, [settings.showFolderTree, updateSetting]);

  const handleTogglePreview = useCallback(() => {
    if (activeDocumentType !== 'markdown') return;
    updateSetting('previewMode', settings.previewMode === 'edit' ? 'split' : 'edit');
  }, [activeDocumentType, settings.previewMode, updateSetting]);

  const handleToggleZenMode = useCallback(() => {
    updateSetting('zenMode', !settings.zenMode);
  }, [settings.zenMode, updateSetting]);

  const handleAdjustFontSize = useCallback((delta: number) => {
    const nextSize = clampNumber(settings.fontSize + delta, 8, 48);
    if (nextSize !== settings.fontSize) {
      updateSetting('fontSize', nextSize);
    }
  }, [settings.fontSize, updateSetting]);

  const handleSelectTabByIndex = useCallback((index: number) => {
    const file = openFilesRef.current[index];
    if (file) {
      setActiveFileId(file.id);
    }
  }, []);

  const handleCycleTabs = useCallback(() => {
    const files = openFilesRef.current;
    if (files.length < 2) return;

    const currentIndex = files.findIndex((file) => file.id === activeFileIdRef.current);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % files.length : 0;
    setActiveFileId(files[nextIndex].id);
  }, []);

  const handleExportHtml = useCallback(async () => {
    const file = openFilesRef.current.find((f) => f.id === activeFileIdRef.current);
    if (!file) return;
    const documentType = getOpenFileType(file);
    const fileBaseName = getExportBaseName(file.name);

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const dest = await save({
        filters: [{ name: 'HTML', extensions: ['html'] }],
        defaultPath: `${fileBaseName}.html`,
      });
      if (dest) {

        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const html = await renderDocumentBody(documentType, file.content, settings.jsonIndentSize);
        const boilerplate = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${file.name}</title>\n</head>\n<body style="font-family: sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto;">\n${html}\n</body>\n</html>`;
        await writeTextFile(dest, boilerplate);
      }
    } catch (e) {
      console.error(e);
    }
  }, [settings.jsonIndentSize]);

  const handleExportPdf = useCallback(async () => {
    const file = openFilesRef.current.find((f) => f.id === activeFileIdRef.current);
    if (!file) return;
    const documentType = getOpenFileType(file);
    const fileBaseName = getExportBaseName(file.name);

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const dest = await save({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: `${fileBaseName}.pdf`,
      });
      if (dest) {

        const html = await renderDocumentBody(documentType, file.content, settings.jsonIndentSize);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        wrapper.style.cssText = 'padding: 2rem; font-family: sans-serif;';
        document.body.appendChild(wrapper);
        
        // @ts-ignore
        const html2pdf = (await import('html2pdf.js')).default;
        
        const opt = {
          margin: 0.5,
          filename: `${fileBaseName}.pdf`,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
        };
        
        await html2pdf().set(opt).from(wrapper).save(dest);
        document.body.removeChild(wrapper);
      }
    } catch (e) {
      console.error(e);
    }
  }, [settings.jsonIndentSize]);

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteMode('commands');
    setShowCommandPalette(true);
  }, []);

  const handleOpenQuickOpen = useCallback(() => {
    setCommandPaletteMode('files');
    setShowCommandPalette(true);
  }, []);

  const handleOpenSearchPanel = useCallback(() => {
    if (settings.zenMode) {
      updateSetting('zenMode', false);
    }
    if (!settings.showFolderTree) {
      updateSetting('showFolderTree', true);
    }
    setSidebarTab('search');
    setSearchPanelOpenToken((prev) => prev + 1);
  }, [settings.showFolderTree, settings.zenMode, updateSetting]);

  const handleOpenIconSearch = useCallback(() => {
    setIconSearchOpen(true);
  }, []);

  const handleInsertIconFromSearch = useCallback((iconName: string) => {
    const container = document.querySelector('[data-testid="codemirror-editor"]') as
      | (HTMLDivElement & { insertText?: (text: string) => void })
      | null;
    container?.insertText?.(iconName);
  }, []);

  // ─── File system watcher listener ─────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<{ kind: string; paths: string[] }>('file-change', (_event) => {
          // Debounce tree refreshes so a burst of filesystem events only rescans once.
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const currentPath = folderPathRef.current;
            if (currentPath) {
              scanFolder(currentPath, true);
            }
          }, 300);
        });
      } catch {
        // Non-Tauri environment
      }
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [scanFolder]);

  // ─── Save-and-close event ────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      const file = openFilesRef.current.find((f) => f.id === detail);
      if (file) {
        const success = await performSave(file);
        if (success) handleCloseFile(detail);
      }
    };
    window.addEventListener('prismpane:saveAndClose', handler);
    return () => window.removeEventListener('prismpane:saveAndClose', handler);
  }, [performSave, handleCloseFile]);

  // ─── File Association Setting Sync ───────────────────────
  useEffect(() => {
    if (settingsLoaded) {
      invoke('toggle_md_association', { enable: settings.associateMdFiles }).catch(console.error);
      invoke('toggle_json_association', { enable: settings.associateJsonFiles }).catch(console.error);
    }
  }, [settings.associateMdFiles, settings.associateJsonFiles, settingsLoaded]);

  // ─── Schema catalog sync ─────────────────────────────────
  useEffect(() => {
    if (!settingsLoaded || !settings.enableJsonSchemaLint) return;

    initializeSchemaCatalogSync().catch((error) => {
      console.warn('Failed to sync schema catalog cache:', error);
    });
  }, [settingsLoaded, settings.enableJsonSchemaLint]);

  // ─── External File / Single Instance Loading ──────────────
  useEffect(() => {
    if (!settingsLoaded) return;
    let unlisten: (() => void) | undefined;

    const setupExternalFileListener = async () => {
      try {
        // Listen for files passed from second instances
        unlisten = await listen<string>('open-external-file', (event) => {
          if (event.payload) {
            openFileByPath(event.payload);
          }
        });

        // Check if a file was passed on initial startup
        const startupFile = await invoke<string | null>('get_startup_file');
        if (startupFile) {
          openFileByPath(startupFile);
        }
      } catch (e) {
        console.error('Failed to setup external file listener:', e);
      }
    };

    setupExternalFileListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [settingsLoaded, openFileByPath]);

  // ─── Global shortcuts ────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const editor = document.querySelector('[data-testid="codemirror-editor"]');
      const isEditorTarget = e.target instanceof Node && !!editor?.contains(e.target);

      // Global shortcuts live here so the app can handle both menu-style actions
      // and editor-specific formatting without duplicating bindings.
      if (e.key === 'F1') {
        e.preventDefault();
        handleOpenCommandPalette();
        return;
      }

      if (!mod) return;

      if (e.shiftKey && e.code === 'KeyP') { e.preventDefault(); handleOpenCommandPalette(); return; }
      if (e.code === 'KeyP') { e.preventDefault(); handleOpenQuickOpen(); return; }

      if (e.code === 'KeyN') { e.preventDefault(); handleNewFile(); return; }
      if (e.shiftKey && e.code === 'KeyO') { e.preventDefault(); handleOpenFolder(); return; }
      if (e.code === 'KeyO') { e.preventDefault(); handleOpenFile(); return; }
      if (e.shiftKey && e.code === 'KeyS') { e.preventDefault(); handleSaveAs(); return; }
      if (e.code === 'KeyS') { e.preventDefault(); handleSaveFile(); return; }
      if (e.code === 'KeyW') { e.preventDefault(); if (activeFileIdRef.current) handleCloseFile(activeFileIdRef.current); return; }
      if (e.code === 'Tab') { e.preventDefault(); handleCycleTabs(); return; }

      if (!e.shiftKey && e.code === 'Digit1') { e.preventDefault(); handleSelectTabByIndex(0); return; }
      if (!e.shiftKey && e.code === 'Digit2') { e.preventDefault(); handleSelectTabByIndex(1); return; }
      if (!e.shiftKey && e.code === 'Digit3') { e.preventDefault(); handleSelectTabByIndex(2); return; }

      if (e.code === 'Comma') { e.preventDefault(); setShowSettings(true); return; }
      if (e.code === 'KeyK') { e.preventDefault(); handleToggleZenMode(); return; }
      if (e.code === 'KeyB') {
        e.preventDefault();
        if (activeDocumentType === 'markdown' && isEditorTarget) {
          handleInlineFormat('**');
        } else {
          handleToggleSidebar();
        }
        return;
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') {
        if (e.code !== 'Equal' || e.shiftKey || e.key === '+') {
          e.preventDefault();
          handleAdjustFontSize(1);
          return;
        }
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') { e.preventDefault(); handleAdjustFontSize(-1); return; }

      if (e.shiftKey && e.code === 'KeyF') { e.preventDefault(); handleOpenSearchPanel(); return; }
      if (e.code === 'KeyF') { e.preventDefault(); handleFind(); return; }
      if (e.code === 'KeyH') { e.preventDefault(); handleReplace(); return; }
      if (e.code === 'KeyG') { e.preventDefault(); handleGoToLine(); return; }

      if (activeDocumentType === 'markdown' && e.code === 'Backslash') { e.preventDefault(); handleTogglePreview(); return; }

      if (activeDocumentType === 'markdown' && isEditorTarget && e.shiftKey && e.code === 'Digit1') { e.preventDefault(); handleBlockTransform('heading1'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && e.shiftKey && e.code === 'Digit2') { e.preventDefault(); handleBlockTransform('heading2'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && e.shiftKey && e.code === 'Digit3') { e.preventDefault(); handleBlockTransform('heading3'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && e.shiftKey && e.code === 'Digit4') { e.preventDefault(); handleBlockTransform('heading4'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && e.shiftKey && e.code === 'Digit5') { e.preventDefault(); handleBlockTransform('heading5'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && e.shiftKey && e.code === 'Digit6') { e.preventDefault(); handleBlockTransform('heading6'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && (e.key === '*' || (e.shiftKey && e.code === 'Digit8'))) { e.preventDefault(); handleBlockTransform('bulletList'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && e.code === 'KeyI') { e.preventDefault(); handleInlineFormat('*'); return; }
      if (activeDocumentType === 'markdown' && isEditorTarget && e.shiftKey && e.code === 'KeyX') { e.preventDefault(); handleInlineFormat('~~'); return; }
      if (activeDocumentType === 'json' && e.altKey && e.code === 'KeyJ') { e.preventDefault(); handleFormatJson(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDocumentType, handleAdjustFontSize, handleBlockTransform, handleCloseFile, handleCycleTabs, handleFind, handleFormatJson, handleGoToLine, handleInlineFormat, handleNewFile, handleOpenCommandPalette, handleOpenFile, handleOpenFolder, handleOpenQuickOpen, handleOpenSearchPanel, handleReplace, handleSaveAs, handleSaveFile, handleSelectTabByIndex, handleTogglePreview, handleToggleSidebar, handleToggleZenMode]);

  // ─── Menu definition ─────────────────────────────────────
  const theme = getThemeById(settings.themeId);
  const c = theme.colors;

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New File', shortcut: 'Ctrl+N', action: handleNewFile },
        { label: 'Open File…', shortcut: 'Ctrl+O', action: handleOpenFile },
        { label: 'Quick Open…', shortcut: 'Ctrl+P', action: handleOpenQuickOpen },
        { label: 'Open Folder…', shortcut: 'Ctrl+Shift+O', action: handleOpenFolder },
        {
          label: 'Open Recent',
          submenu: recentFiles.map((p) => ({
            label: p.split(/[/\\]/).pop() || p,
            action: () => openFileByPath(p)
          })).concat(recentFiles.length > 0 ? [{ label: '', separator: true } as any] : []).concat(
            recentFolders.map((p) => ({
              label: `[Folder] ${p.split(/[/\\]/).pop() || p}`,
              action: () => scanFolder(p)
            }))
          )
        },
        { label: 'Close Folder', action: handleCloseFolder, disabled: !folderPath },
        { label: '', separator: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: handleSaveFile },
        { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: handleSaveAs },
        { label: '', separator: true },
        { label: 'Save All', action: handleSaveAll },
        { label: '', separator: true },
        { label: 'Export as HTML', action: handleExportHtml },
        { label: 'Export as PDF', action: handleExportPdf },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Time', action: handleInsertTime },
        { label: 'Date', action: handleInsertDate },
        { label: 'Timestamp', action: handleInsertTimestamp },
        { label: 'Format JSON', shortcut: 'Ctrl+Alt+J', disabled: activeDocumentType !== 'json', action: handleFormatJson },
        { label: '', separator: true },
        { label: 'Generate TOC', disabled: activeDocumentType !== 'markdown', action: handleGenerateTOC },
        { label: '', separator: true },
        { label: 'Copy as HTML', disabled: activeDocumentType !== 'markdown', action: handleCopyAsHtml },
        { label: 'Paste From HTML', disabled: activeDocumentType !== 'markdown', action: handlePasteFromHtml },
        { label: '', separator: true },
        { label: 'Duplicate Line Down', shortcut: 'Shift+Alt+Down', action: handleDuplicateLine },
        { label: 'Move Line Up', shortcut: 'Alt+Up', action: handleMoveLineUp },
        { label: 'Move Line Down', shortcut: 'Alt+Down', action: handleMoveLineDown },
        { label: 'Delete Line', shortcut: 'Ctrl+Shift+K', action: () => editorCommand('deleteLine') },
        { label: '', separator: true },
        { label: 'Transform Case', action: handleTransformCase },
        { label: '', separator: true },
        { label: 'Settings', shortcut: 'Ctrl+,', action: () => setShowSettings(true) },
      ],
    },
    {
      label: 'View',
      items: [
        { 
          label: 'Theme', 
          submenu: THEMES.map(t => ({
            label: t.name,
            checked: settings.themeId === t.id,
            action: () => updateSetting('themeId', t.id)
          }))
        },
        {
          label: 'Font Size',
          submenu: [12, 13, 14, 15, 16, 18, 20, 24].map(size => ({
            label: `${size}px`,
            checked: settings.fontSize === size,
            action: () => updateSetting('fontSize', size)
          }))
        },
        { label: 'Increase Font Size', shortcut: 'Ctrl++', action: () => handleAdjustFontSize(1) },
        { label: 'Decrease Font Size', shortcut: 'Ctrl+-', action: () => handleAdjustFontSize(-1) },
        { label: '', separator: true },
        {
          label: 'Toolbars',
          submenu: [
            { label: 'File Toolbar', checked: settings.showFileToolbar, action: () => updateSetting('showFileToolbar', !settings.showFileToolbar) },
            { label: 'Formatting Toolbar', checked: settings.showFormattingToolbar, action: () => updateSetting('showFormattingToolbar', !settings.showFormattingToolbar) }
          ]
        },
        { label: 'Folder Tree', shortcut: 'Ctrl+B', checked: settings.showFolderTree, action: handleToggleSidebar },
        { label: '', separator: true },
        { label: 'Toggle Line Numbers', checked: settings.showLineNumbers, action: () => updateSetting('showLineNumbers', !settings.showLineNumbers) },
        { label: 'Toggle Word Wrap', checked: settings.wordWrap, action: () => updateSetting('wordWrap', !settings.wordWrap) },
        { label: 'Toggle Active Line', checked: settings.showActiveLine, action: () => updateSetting('showActiveLine', !settings.showActiveLine) },
        { label: '', separator: true },
        { label: 'Preview Mode', shortcut: 'Ctrl+\\', checked: settings.previewMode !== 'edit', action: handleTogglePreview },
        { label: 'Typewriter Mode', checked: settings.typewriterMode, action: () => updateSetting('typewriterMode', !settings.typewriterMode) },
        { label: 'Zen Mode', shortcut: 'Ctrl+K', checked: settings.zenMode, action: handleToggleZenMode },
        { label: '', separator: true },
        { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', action: handleOpenCommandPalette },
      ],
    },
    {
      label: 'Search',
      items: [
        { label: 'Quick Open…', shortcut: 'Ctrl+P', action: handleOpenQuickOpen },
        { label: 'Find…', shortcut: 'Ctrl+F', action: handleFind },
        { label: 'Find Next', shortcut: 'F3', action: handleFindNext },
        { label: 'Find Previous', shortcut: 'Shift+F3', action: handleFindPrevious },
        { label: '', separator: true },
        { label: 'Replace…', shortcut: 'Ctrl+H', action: handleReplace },
        { label: 'Search in Folder…', shortcut: 'Ctrl+Shift+F', action: handleOpenSearchPanel },
        { label: 'Icon Search…', action: handleOpenIconSearch },
        { label: 'Go to Line…', shortcut: 'Ctrl+G', action: handleGoToLine },
        { label: 'Replace in Open Files', action: () => { /* placeholder */ handleReplace(); } },
        { label: 'Replace in All Folder Files', disabled: !folderPath, action: handleReplace },
      ],
    },
    {
      label: 'Templates',
      items: TEMPLATES.map((t) => ({
        label: t.name,
        action: () => handleTemplateSelect(t),
      })),
    },
  ];

  const tabFiles = openFiles.map((f) => ({
    id: f.id,
    name: f.name,
    isDirty: f.isDirty,
  }));

  const activeContentLines = activeFile ? activeFile.content.split('\n').length : 0;
  const activeContentChars = activeFile ? activeFile.content.length : 0;
  const activeContentWords = activeFile ? activeFile.content.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  const readingTime = Math.max(1, Math.ceil(activeContentWords / 200));

  const quickOpenItems = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [];
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();

    // Open tabs first, then folder files, then recent files.
    // The dedupe sets keep the palette from showing the same file multiple times.
    for (const file of openFiles) {
      const normalizedPath = file.filePath ? file.filePath.toLowerCase() : '';
      if (normalizedPath) {
        seenPaths.add(normalizedPath);
      }

      const description = file.filePath || 'Open tab';
      const dedupeKey = file.filePath ? `path:${normalizedPath}` : `tab:${file.id}`;
      if (seenIds.has(dedupeKey)) continue;

      seenIds.add(dedupeKey);
      items.push({
        label: file.name,
        description,
        action: () => setActiveFileId(file.id),
      });
    }

    for (const node of collectFileNodes(folderTree)) {
      const realPath = resolveRealPathFromTreePath(folderPath, node.path);
      const normalizedPath = realPath.toLowerCase();
      if (seenPaths.has(normalizedPath)) continue;

      seenPaths.add(normalizedPath);
      items.push({
        label: node.name,
        description: getRelativeTreePath(node.path) || node.name,
        action: () => { void openFileByPath(realPath); },
      });
    }

    for (const filePath of recentFiles) {
      const normalizedPath = filePath.toLowerCase();
      if (seenPaths.has(normalizedPath)) continue;

      seenPaths.add(normalizedPath);
      items.push({
        label: filePath.split(/[/\\]/).pop() || filePath,
        description: filePath,
        action: () => { void openFileByPath(filePath); },
      });
    }

    return items;
  }, [folderPath, folderTree, openFiles, openFileByPath, recentFiles]);

  // ─── Loading state ───────────────────────────────────────
  if (!settingsLoaded || !tabsRestored) {
    return (
      <div
        className="flex items-center justify-center h-screen w-screen"
        style={{ backgroundColor: c.background, color: c.foreground }}
      >
        <div className="text-center opacity-40">
          <div className="text-4xl mb-2">📝</div>
          <p className="text-xs">Loading PrismPane...</p>
        </div>
      </div>
    );
  }

  const baseCommandPaletteCommands: CommandPaletteItem[] = [
    { label: 'Quick Open', action: handleOpenQuickOpen, shortcut: 'Ctrl+P' },
    { label: 'New File', action: handleNewFile, shortcut: 'Ctrl+N' },
    { label: 'Open File', action: handleOpenFile, shortcut: 'Ctrl+O' },
    { label: 'Open Folder', action: handleOpenFolder, shortcut: 'Ctrl+Shift+O' },
    { label: 'Save', action: handleSaveFile, shortcut: 'Ctrl+S' },
    { label: 'Save As', action: handleSaveAs, shortcut: 'Ctrl+Shift+S' },
    { label: 'Find', action: handleFind, shortcut: 'Ctrl+F' },
    { label: 'Replace', action: handleReplace, shortcut: 'Ctrl+H' },
    { label: 'Search in Folder', action: handleOpenSearchPanel, shortcut: 'Ctrl+Shift+F' },
    { label: 'Go to Line', action: handleGoToLine, shortcut: 'Ctrl+G' },
    { label: 'Settings', action: () => setShowSettings(true), shortcut: 'Ctrl+,' },
    { label: 'Toggle Sidebar', action: handleToggleSidebar, shortcut: 'Ctrl+B' },
    { label: 'Toggle Zen Mode', action: handleToggleZenMode, shortcut: 'Ctrl+K' },
    { label: 'Increase Font Size', action: () => handleAdjustFontSize(1), shortcut: 'Ctrl++' },
    { label: 'Decrease Font Size', action: () => handleAdjustFontSize(-1), shortcut: 'Ctrl+-' },
    ...(activeDocumentType === 'markdown' ? [{ label: 'Toggle Preview', action: handleTogglePreview, shortcut: 'Ctrl+\\' }] : []),
    { label: 'Toggle Typewriter Mode', action: () => updateSetting('typewriterMode', !settings.typewriterMode) },
    { label: 'Export to HTML', action: handleExportHtml },
    { label: 'Export to PDF', action: handleExportPdf },
    ...(activeDocumentType === 'json' ? [{ label: 'Format JSON', action: handleFormatJson, shortcut: 'Ctrl+Alt+J' }] : []),
    ...(activeDocumentType === 'markdown' ? [{ label: 'Generate Table of Contents', action: handleGenerateTOC }] : []),
  ];

  const commandPaletteCommands = settings.zenMode 
    ? [
        baseCommandPaletteCommands.find(c => c.label === 'Toggle Zen Mode')!,
        ...baseCommandPaletteCommands.filter(c => c.label !== 'Toggle Zen Mode')
      ]
    : baseCommandPaletteCommands;

  const commandPaletteItems = commandPaletteMode === 'files' ? quickOpenItems : commandPaletteCommands;

  return (
    <div
      className="prismpane-shell flex flex-col h-screen w-screen overflow-hidden"
      style={{
        backgroundColor: c.background,
        color: c.foreground,
        '--sidebar-bg': c.sidebarBackground,
        '--sidebar-fg': c.sidebarForeground,
        '--sidebar-border': `${c.sidebarForeground}18`,
        '--sidebar-active': c.activeTab,
        '--toolbar-bg': c.toolbarBackground,
        '--toolbar-fg': c.toolbarForeground,
        '--toolbar-border': `${c.toolbarForeground}20`,
        '--editor-bg': c.background,
        '--active-tab-color': c.activeTab,
      } as React.CSSProperties}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,.json"
        onChange={handleFileInputChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* ── Menu Bar ── */}
      {!settings.zenMode && (
        <MenuBar
          menus={menus}
          menuBarBg={c.toolbarBackground}
          menuBarBorder={`${c.toolbarForeground}20`}
          menuBarFg={c.toolbarForeground}
          menuBarHover={`${c.toolbarForeground}15`}
        />
      )}

      {/* ── Body: sidebar + main ── */}
      <div className="prismpane-workspace flex flex-1 min-h-0">
        {settings.showFolderTree && !settings.zenMode && (
          <Sidebar
            folderPath={folderPath}
            folderTree={folderTree}
            expandedFolders={expandedFolders}
            onToggleExpand={handleToggleExpand}
            onFileOpen={openFileByPath}
            onSearchResultClick={handleSearchResultClick}
            onFileRename={handleFileRename}
            onFileAction={handleFileAction}
            onOpenFolder={handleOpenFolder}
            selectedFolderPath={selectedTreeFolder}
            onSelectFolder={handleSelectFolder}
            sidebarBg={c.sidebarBackground}
            sidebarFg={c.sidebarForeground}
            sidebarBorder={`${c.sidebarForeground}18`}
            activeColor={c.activeTab}
            activeFilePath={activeFile?.filePath ?? null}
            activeFileContent={activeFile?.content || null}
            onNavigateToLine={handleNavigateToLine}
            visibleFiles={settings.visibleFiles}
            problems={allProblems}
            onProblemClick={handleProblemClick}
            activeTab={sidebarTab}
            onActiveTabChange={setSidebarTab}
            searchPanelOpenToken={searchPanelOpenToken}
          />
        )}

        <div className="flex flex-col flex-1 min-w-0">
          {(settings.showFileToolbar || settings.showFormattingToolbar) && !settings.zenMode && (
            <Toolbar
              onBlockTransform={handleBlockTransform}
              themeId={settings.themeId}
              onNewFile={handleNewFile}
              onOpenFile={handleOpenFile}
              onSaveFile={handleSaveFile}
              onOpenFolder={handleOpenFolder}
              showFileToolbar={settings.showFileToolbar}
              showFormattingToolbar={settings.showFormattingToolbar}
              documentType={activeDocumentType}
              folderPath={folderPath}
              useFullPath={settings.useFullPath}
            />
          )}

          {!settings.zenMode && (
            <TabBar
              files={tabFiles}
              activeFileId={activeFileId}
              onTabSelect={handleFileSelect}
              onTabClose={handleCloseFile}
              onTabRename={handleTabRename}
              onTabReorder={handleTabReorder}
              tabSavedColor={c.tabSavedColor}
              tabUnsavedColor={c.tabUnsavedColor}
              tabSavedTextColor={c.tabSavedText}
              tabUnsavedTextColor={c.tabUnsavedText}
              activeTabColor={c.activeTab}
              inactiveTabColor={c.inactiveTab}
              tabBarBackground={c.toolbarBackground}
              tabBarBorder={`${c.toolbarForeground}20`}
            />
          )}

          <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
            {activeFile ? (
              <>
                <div className="flex-1 min-w-0 h-full relative">
                  <Editor
                    key={activeFile.id}
                    content={activeFile.content}
                    settings={settings}
                    qualityIssues={activeQualityIssues}
                    onContentChange={handleContentChange}
                    onCursorChange={(pos) => { cursorPositionsRef.current[activeFile.id] = pos; }}
                    initialCursorPos={cursorPositionsRef.current[activeFile.id] ?? activeFile.cursorPos ?? 0}
                    onRequestDiagnostics={handleRequestDiagnostics}
                    onDiagnosticsChange={handleEditorDiagnosticsChange}
                    onPasteText={handleEditorPaste}
                    folderPath={folderPath}
                    documentType={activeDocumentType}
                  />
                </div>
                {settings.previewMode !== 'edit' && (
                  <div className="flex-1 h-full border-l" style={{ borderColor: `${c.foreground}15` }}>
                    <Preview
                      content={activeFile.content}
                      themeId={settings.themeId}
                      documentType={activeDocumentType}
                      jsonIndentSize={settings.jsonIndentSize}
                    />
                  </div>
                )}
              </>
            ) : (
              <div
                className="card flex flex-1 items-center justify-center h-full"
                style={{ backgroundColor: c.background }}
              >
                <div className="text-center space-y-4 opacity-50 px-6">
                  <div className="text-6xl">📝</div>
                  <div>
                    <p className="text-base font-semibold">Welcome to PrismPane</p>
                    <p className="text-xs mt-1 opacity-60">
                      Create a new file (Ctrl+N) or open an existing one (Ctrl+O)
                    </p>
                    <p className="text-xs mt-1 opacity-40">
                      Open a folder to browse your Markdown and JSON files in the sidebar
                    </p>
                  </div>
                  <div className="flex gap-3 justify-center mt-6">
                    <button
                      onClick={handleNewFile}
                      className="btn btn-primary px-8 py-3 text-[13px] font-medium rounded-xl transition-all duration-300 hover:bg-white/10 active:scale-95 shadow-sm border"
                      style={{ borderColor: `${c.foreground}30` }}
                    >
                      New File
                    </button>
                    <button
                      onClick={handleOpenFile}
                      className="btn px-8 py-3 text-[13px] font-medium rounded-xl transition-all duration-300 hover:bg-white/10 active:scale-95 shadow-sm border"
                      style={{ borderColor: `${c.foreground}30` }}
                    >
                      Open File
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {activeFile && (
            <div
              className="prismpane-statusbar flex items-center gap-4 px-5 py-1.5 text-[11px] border-t shrink-0 glass backdrop-blur-md z-10 transition-opacity duration-300"
              style={{
                backgroundColor: `color-mix(in srgb, ${c.toolbarBackground} 80%, transparent)`,
                borderColor: `${c.toolbarForeground}20`,
                color: c.toolbarForeground,
                opacity: settings.zenMode ? 0.3 : 1,
              }}
            >
              <span>
                {activeFile.name}
                {activeFile.isDirty && (
                  <span style={{ color: c.tabUnsavedColor }}> • Unsaved</span>
                )}
              </span>
              <span className="opacity-50">{activeContentLines} lines</span>
              <span className="opacity-50">{activeContentWords} words</span>
              <span className="opacity-50">{activeContentChars} chars</span>
              <span className="opacity-50">{readingTime} min read</span>
              <div className="flex-1" />
              <span className="opacity-40">
                {settings.showLineNumbers ? 'Ln' : ''} · {settings.fontSize}px · {theme.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdateSetting={updateSetting}
          onClose={() => setShowSettings(false)}
          onReset={resetSettings}
        />
      )}
      
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        items={commandPaletteItems}
        themeId={settings.themeId}
        placeholder={commandPaletteMode === 'files' ? 'Search files...' : 'Type a command or search...'}
        emptyMessage={commandPaletteMode === 'files' ? 'No matching files found' : 'No matching commands found'}
      />

      {zenHintVisible && (
        <Modal
          title="Zen Mode"
          onClose={() => {
            if (doNotShowAgain) {
              updateSetting('showZenModeHint', false);
            }
            setZenHintVisible(false);
          }}
          widthClass="w-[min(50vw,400px)] max-w-[50vw]"
          heightClass="h-auto max-h-[80vh]"
          bodyClassName="p-6 gap-4"
        >
          <div className="text-sm text-center">
            <p className="opacity-80">
              Open the <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-xs">Command Palette</kbd> (<kbd className="px-1.5 py-0.5 rounded bg-white/20 text-xs">Ctrl + Shift + P</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-xs">F1</kbd>) to exit Zen Mode.
            </p>
          </div>
          <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-800">
            <label className="form-check flex items-center gap-2 text-xs opacity-80 cursor-pointer hover:opacity-100">
              <input 
                type="checkbox" 
                checked={doNotShowAgain}
                onChange={(e) => setDoNotShowAgain(e.target.checked)}
                className="form-check-input rounded border-white/30 bg-black/50 cursor-pointer h-3.5 w-3.5"
              />
              Do Not Show Again
            </label>
            <button 
              onClick={() => {
                if (doNotShowAgain) {
                  updateSetting('showZenModeHint', false);
                }
                setZenHintVisible(false);
              }}
              className="btn btn-primary px-4 py-1.5 bg-white text-black text-xs font-semibold rounded hover:bg-white/90 transition-colors"
            >
              Okay
            </button>
          </div>
        </Modal>
      )}

      {typewriterHintVisible && (
        <Modal
          title={`Typewriter Mode ${settings.typewriterMode ? 'Enabled' : 'Disabled'}`}
          onClose={() => {
            if (typewriterDoNotShowAgain) {
              updateSetting('showTypewriterModeHint', false);
            }
            setTypewriterHintVisible(false);
          }}
          widthClass="w-[min(50vw,400px)] max-w-[50vw]"
          heightClass="h-auto max-h-[80vh]"
          bodyClassName="p-6 gap-4"
        >
          <div className="text-sm text-center">
            <p className="opacity-80">
              {settings.typewriterMode 
                ? 'The active line will remain vertically centered on the screen as you type.' 
                : 'The screen will no longer stay centered on the active line.'}
            </p>
          </div>
          <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-800">
            <label className="form-check flex items-center gap-2 text-xs opacity-80 cursor-pointer hover:opacity-100">
              <input 
                type="checkbox" 
                checked={typewriterDoNotShowAgain}
                onChange={(e) => setTypewriterDoNotShowAgain(e.target.checked)}
                className="form-check-input rounded border-white/30 bg-black/50 cursor-pointer h-3.5 w-3.5"
              />
              Do Not Show Again
            </label>
            <button 
              onClick={() => {
                if (typewriterDoNotShowAgain) {
                  updateSetting('showTypewriterModeHint', false);
                }
                setTypewriterHintVisible(false);
              }}
              className="btn btn-primary px-4 py-1.5 bg-white text-black text-xs font-semibold rounded hover:bg-white/90 transition-colors"
            >
              Okay
            </button>
          </div>
        </Modal>
      )}

      {iconSearchOpen && (
        <IconSearchModal
          onClose={() => setIconSearchOpen(false)}
          onInsertIcon={handleInsertIconFromSearch}
        />
      )}
    </div>
  );
}

export default App;