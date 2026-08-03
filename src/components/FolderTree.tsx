// ============================================================
// PrismPane — Folder Tree View
// ============================================================

import { memo, useState, useCallback, useRef } from 'react';
import { IconChevronRight, IconChevronDown, IconFolder, IconFolderOpen, IconFileText } from '@tabler/icons-react';
import { cn } from './ui/utils';
import { isVisibleFile } from '../fileUtils';
import type { VisibleFilesMode } from '../types';

export interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
}

// ─── Sort: folders first (A-Z), then files (A-Z) ──────────

function getVisibleNodes(nodes: TreeNode[], visibleFiles: VisibleFilesMode): TreeNode[] {
  // Directories stay first so the tree reads like a file explorer.
  return [...nodes]
    .filter((n) => isVisibleFile(n.name, n.isDirectory, visibleFiles))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

// ─── Check if a directory subtree contains any visible files ───

function hasVisibleDescendants(node: TreeNode, visibleFiles: VisibleFilesMode): boolean {
  if (!node.children) return false;
  // Used to dim folders that do not contain any currently visible files.
  for (const child of node.children) {
    if (isVisibleFile(child.name, child.isDirectory, visibleFiles)) return true;
    if (hasVisibleDescendants(child, visibleFiles)) return true;
  }
  return false;
}

interface FolderTreeProps {
  rootPath: string;
  tree: TreeNode[];
  activeFilePath: string | null;
  onFileOpen: (filePath: string) => void;
  onFileRename: (oldPath: string, newName: string) => void;
  onFileAction: (action: 'saveAs' | 'exportPdf' | 'exportHtml' | 'print' | 'share' | 'duplicate', filePath: string) => void;
  expanded: Set<string>;
  onToggleExpand: (path: string) => void;
  selectedFolderPath: string | null;
  onSelectFolder: (path: string | null) => void;
  bgColor: string;
  fgColor: string;
  borderColor: string;
  activeColor: string;
  visibleFiles: VisibleFilesMode;
  resolveRealPath: (treePath: string) => string;
}

// ─── Recursive Tree Node ──────────────────────────────────

function TreeNodeView({
  node,
  depth,
  activeFilePath,
  onFileOpen,
  onFileRename,
  onFileAction,
  expanded,
  onToggleExpand,
  fgColor,
  activeColor,
  selectedFolderPath,
  onSelectFolder,
  visibleFiles,
  resolveRealPath,
}: {
  node: TreeNode;
  depth: number;
  activeFilePath: string | null;
  onFileOpen: (path: string) => void;
  onFileRename: (oldPath: string, newName: string) => void;
  onFileAction: (action: 'saveAs' | 'exportPdf' | 'exportHtml' | 'print' | 'share' | 'duplicate', filePath: string) => void;
  expanded: Set<string>;
  onToggleExpand: (path: string) => void;
  fgColor: string;
  activeColor: string;
  selectedFolderPath: string | null;
  onSelectFolder: (path: string | null) => void;
  visibleFiles: VisibleFilesMode;
  resolveRealPath: (treePath: string) => string;
}) {
  const isExpanded = expanded.has(node.path);
  const paddingLeft = depth * 16 + 8;

  const handleDragStart = (e: React.DragEvent) => {
    const realPath = resolveRealPath(node.path);
    e.dataTransfer.setData('prismpane-file', realPath);
    e.dataTransfer.effectAllowed = 'copy';
  };

  if (node.isDirectory) {
    const hasVisible = node.children ? hasVisibleDescendants(node, visibleFiles) : false;
    const isEmpty = !node.children || node.children.length === 0;
    return (
      <div>
        <div role="button" tabIndex={0}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              onSelectFolder(selectedFolderPath === node.path ? null : node.path);
            } else {
              onToggleExpand(node.path);
              onSelectFolder(selectedFolderPath === node.path ? null : node.path);
            }
          }}
          className="w-full flex items-center gap-2.5 py-2.5 my-0.5 text-[13px] text-left hover:bg-white/10 transition-all duration-200 rounded-lg pr-3"
          style={{
            marginLeft: `${paddingLeft}px`,
            paddingLeft: '8px',
            color: fgColor,
            opacity: isEmpty ? 0.35 : hasVisible ? 0.9 : 0.45,
            backgroundColor: selectedFolderPath === node.path ? 'rgba(255,255,255,0.1)' : 'transparent',
            fontWeight: hasVisible ? 600 : 400,
          }}
          draggable
          onDragStart={handleDragStart}
        >
          <span className="shrink-0">
            {isExpanded ? (
              <IconChevronDown className="h-3 w-3" stroke={1.75} />
            ) : (
              <IconChevronRight className="h-3 w-3" stroke={1.75} />
            )}
          </span>
          <span className="shrink-0">
            {isExpanded ? (
              <IconFolderOpen className="h-3.5 w-3.5 opacity-60" stroke={1.75} />
            ) : (
              <IconFolder className="h-3.5 w-3.5 opacity-60" stroke={1.75} />
            )}
          </span>
          <span className="truncate">{node.name}</span>
        </div>
        {isExpanded && node.children && node.children.length > 0 && (
          <div>
            {getVisibleNodes(node.children!, visibleFiles).map((child) => (
              <TreeNodeView
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                onFileOpen={onFileOpen}
                onFileRename={onFileRename}
                onFileAction={onFileAction}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                fgColor={fgColor}
                activeColor={activeColor}
                selectedFolderPath={selectedFolderPath}
                onSelectFolder={onSelectFolder}
                visibleFiles={visibleFiles}
                resolveRealPath={resolveRealPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  const isActive = activeFilePath === node.path;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(() => {
    setIsRenaming(true);
    setRenameValue(node.name);
    setTimeout(() => renameInputRef.current?.select(), 10);
  }, [node.name]);

  const commitRename = useCallback(() => {
    if (isRenaming && renameValue.trim()) {
      onFileRename(node.path, renameValue.trim());
    }
    setIsRenaming(false);
  }, [isRenaming, renameValue, node.path, onFileRename]);

  return (
    <div role="button" tabIndex={0}
      onClick={() => {
        if (isActive && !isRenaming) {
          startRename();
        } else {
          onFileOpen(node.path);
          onSelectFolder(null);
        }
      }}
      onDoubleClick={() => {
        if (!isRenaming) onFileOpen(node.path);
      }}
      onContextMenu={async (e) => {
        e.preventDefault();
        try {
          const { Menu, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
          
          const menuItems = [
            { id: 'rename', text: 'Rename', action: () => startRename() },
            await PredefinedMenuItem.new({ item: 'Separator' }),
            { id: 'saveAs', text: 'Save As...', action: () => onFileAction('saveAs', node.path) },
            { id: 'duplicate', text: 'Duplicate', action: () => onFileAction('duplicate', node.path) },
            await PredefinedMenuItem.new({ item: 'Separator' }),
            { id: 'exportPdf', text: 'Export as PDF', action: () => onFileAction('exportPdf', node.path) },
            { id: 'exportHtml', text: 'Export as HTML', action: () => onFileAction('exportHtml', node.path) },
            await PredefinedMenuItem.new({ item: 'Separator' }),
            { id: 'print', text: 'Print', action: () => onFileAction('print', node.path) },
            { id: 'share', text: 'Share', action: () => onFileAction('share', node.path) },
          ];

          const menu = await Menu.new({
            items: menuItems
          });
          await menu.popup();
        } catch (err) {
          // Fallback if Tauri menu is not available
          startRename();
        }
      }}
      className={cn(
        "w-full flex items-center gap-2.5 py-2.5 my-0.5 text-[13px] text-left transition-all duration-200 rounded-lg pr-3 group",
        isActive ? "bg-white/10" : "hover:bg-white/10"
      )}
      style={{
        marginLeft: `${paddingLeft}px`,
        paddingLeft: '8px',
        color: isActive ? activeColor : fgColor,
      }}
      draggable
      onDragStart={handleDragStart}
    >
      <span className="shrink-0 w-3.5" />
      <IconFileText className="h-[14px] w-[14px] shrink-0 opacity-50 group-hover:opacity-80 transition-opacity" stroke={1.75} />
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') setIsRenaming(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent border-b border-current outline-none text-[13px] w-full"
          style={{ color: activeColor }}
        />
      ) : (
        <span className="truncate opacity-80 group-hover:opacity-100 transition-opacity">{node.name}</span>
      )}
    </div>
  );
}

// ─── FolderTree Component ─────────────────────────────────

const FolderTree = memo(function FolderTree({
  rootPath,
  tree,
  activeFilePath,
  onFileOpen,
  onFileRename,
  onFileAction,
  expanded,
  onToggleExpand,
  selectedFolderPath,
  onSelectFolder,
  bgColor,
  fgColor,
  borderColor,
  activeColor,
  visibleFiles,
  resolveRealPath,
}: FolderTreeProps) {
  const visibleNodes = getVisibleNodes(tree, visibleFiles);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: bgColor, color: fgColor }}
    >
      {/* Root path header */}
      <div
        className="px-4 py-2.5 text-[10px] font-medium opacity-50 border-b truncate"
        style={{ borderColor }}
        title={rootPath}
      >
        {rootPath.split(/[/\\]/).pop() || rootPath}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {visibleNodes.map((node) => (
          <TreeNodeView
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onFileOpen={onFileOpen}
            onFileRename={onFileRename}
            onFileAction={onFileAction}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            fgColor={fgColor}
            activeColor={activeColor}
            selectedFolderPath={selectedFolderPath}
            onSelectFolder={onSelectFolder}
            visibleFiles={visibleFiles}
            resolveRealPath={resolveRealPath}
          />
        ))}
        {visibleNodes.length === 0 && (
          <div className="px-6 py-8 text-center text-[10px] opacity-30 italic">
            No files found
          </div>
        )}
      </div>
    </div>
  );
});

export default FolderTree;

// ─── Build tree from flat file list ────────────────────────

export interface FlatFileEntry {
  path: string;
  isDirectory: boolean;
}

export function buildFileTree(files: FlatFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  // Convert flat filesystem paths into nested tree nodes for the sidebar.
  for (const file of files) {
    const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1 && !file.isDirectory;
      const isDir = !isLast || file.isDirectory;
      const name = parts[i];

      let existing = current.find((n) => n.name === name && n.isDirectory === isDir);

      if (!existing) {
        existing = {
          name,
          path: '/' + parts.slice(0, i + 1).join('/'),
          isDirectory: isDir,
          children: isDir ? [] : undefined,
        };
        current.push(existing);
      }

      if (isDir && existing.children) {
        current = existing.children;
      }
    }
  }

  return root;
}