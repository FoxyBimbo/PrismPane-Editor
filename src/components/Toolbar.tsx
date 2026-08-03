// ============================================================
// PrismPane — Block Format Toolbar
// ============================================================

import { memo, useCallback, useState, useRef, useEffect, type ComponentType } from 'react';
import {
  IconH1, IconH2, IconH3, IconH4, IconH5, IconH6,
  IconPilcrow, IconBlockquote, IconList, IconListNumbers, IconBold, IconItalic,
  IconStrikethrough, IconCode, IconMinus, IconChevronDown, IconPhoto, IconTable, IconCheckbox, IconCirclePlus,
  IconFilePlus, IconFileImport, IconFolderOpen, IconDeviceFloppy,
  IconFold, IconWand, IconSortAscendingLetters, IconSchema
} from '@tabler/icons-react';
import type { BlockType, EditorDocumentType } from '../types';
import { cn } from './ui/utils';

interface ToolButton {
  icon: ComponentType<{ className?: string; stroke?: string | number; strokeWidth?: string | number }>;
  label: string;
  blockType: BlockType;
  shortcut?: string;
}

const HEADING_OPTIONS: { blockType: BlockType; label: string; shortcut: string; icon: ComponentType<{ className?: string; stroke?: string | number; strokeWidth?: string | number }> }[] = [
  { blockType: 'heading1', label: 'Heading 1', shortcut: 'Ctrl+Shift+1', icon: IconH1 },
  { blockType: 'heading2', label: 'Heading 2', shortcut: 'Ctrl+Shift+2', icon: IconH2 },
  { blockType: 'heading3', label: 'Heading 3', shortcut: 'Ctrl+Shift+3', icon: IconH3 },
  { blockType: 'heading4', label: 'Heading 4', shortcut: 'Ctrl+Shift+4', icon: IconH4 },
  { blockType: 'heading5', label: 'Heading 5', shortcut: 'Ctrl+Shift+5', icon: IconH5 },
  { blockType: 'heading6', label: 'Heading 6', shortcut: 'Ctrl+Shift+6', icon: IconH6 },
];

const TOOLS: ToolButton[] = [
  { icon: IconPilcrow, label: 'Paragraph', blockType: 'paragraph', shortcut: 'Ctrl+0' },
  { icon: IconBlockquote, label: 'Blockquote', blockType: 'blockquote', shortcut: 'Ctrl+Q' },
  { icon: IconList, label: 'Bullet List', blockType: 'bulletList', shortcut: 'Ctrl+*' },
  { icon: IconListNumbers, label: 'Ordered List', blockType: 'orderedList', shortcut: 'Ctrl+Shift+L' },
  { icon: IconCode, label: 'Code Block', blockType: 'codeBlock', shortcut: '' },
  { icon: IconMinus, label: 'Horizontal Rule', blockType: 'horizontalRule', shortcut: '' },
];

interface ToolbarProps {
  onBlockTransform: (type: BlockType) => void;
  themeId: string;
  onNewFile: () => void;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onOpenFolder: () => void;
  showFileToolbar: boolean;
  showFormattingToolbar: boolean;
  folderPath?: string | null;
  useFullPath?: boolean;
  documentType?: EditorDocumentType;
}

const Toolbar = memo(function Toolbar({
  onBlockTransform,
  themeId,
  onNewFile,
  onOpenFile,
  onSaveFile,
  onOpenFolder,
  showFileToolbar,
  showFormattingToolbar,
  folderPath,
  useFullPath = true,
  documentType = 'markdown',
}: ToolbarProps) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);

  const [insertOpen, setInsertOpen] = useState(false);
  const [insertType, setInsertType] = useState<'link' | 'file' | 'folder'>('link');
  const [insertName, setInsertName] = useState('');
  const [insertValue, setInsertValue] = useState('');
  const insertRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!headingOpen) return;
    const handler = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) {
        setHeadingOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [headingOpen]);

  useEffect(() => {
    if (!insertOpen) return;
    const handler = (e: MouseEvent) => {
      if (insertRef.current && !insertRef.current.contains(e.target as Node)) {
        setInsertOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [insertOpen]);

  const handleBrowse = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: insertType === 'folder',
      });
      if (selected && typeof selected === 'string') {
        setInsertValue(selected);
        if (!insertName) {
           setInsertName(selected.split(/[/\\]/).pop() || '');
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [insertType, insertName]);

  const executeInsert = useCallback(() => {
    if (!insertValue) return;
    let finalPath = insertValue;
    if (insertType === 'file' || insertType === 'folder') {
       finalPath = finalPath.replace(/\\/g, '/');
       if (!useFullPath && folderPath) {
         const normFolder = folderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/';
         if (finalPath.startsWith(normFolder)) {
            finalPath = finalPath.slice(normFolder.length);
         } else {
            finalPath = `file:///${finalPath}`;
         }
       } else {
         finalPath = `file:///${finalPath}`;
       }
    }
    const el = document.querySelector('[data-testid="codemirror-editor"]') as
      | (HTMLDivElement & { insertCustomLink?: (name: string, url: string) => void })
      | null;
    el?.insertCustomLink?.(insertName || (insertType === 'link' ? 'link' : 'file'), finalPath);
    setInsertOpen(false);
  }, [insertName, insertValue, insertType, folderPath, useFullPath]);

  const handleClick = useCallback(
    (type: BlockType) => {
      onBlockTransform(type);
    },
    [onBlockTransform],
  );

  const handleHeadingSelect = useCallback(
    (type: BlockType) => {
      onBlockTransform(type);
      setHeadingOpen(false);
    },
    [onBlockTransform],
  );

  const handleInlineFormat = useCallback((wrapper: string) => {
    const el = document.querySelector('[data-testid="codemirror-editor"]') as
      | (HTMLDivElement & { toggleInlineFormatting?: (wrapper: string) => void })
      | null;
    el?.toggleInlineFormatting?.(wrapper);
  }, []);

  const handleCommand = useCallback((cmd: string) => {
    const el = document.querySelector('[data-testid="codemirror-editor"]') as
      | (HTMLDivElement & Record<string, (() => void) | undefined>)
      | null;
    el?.[cmd]?.();
  }, []);

  return (
    <div
      className="btn-toolbar flex items-center gap-2 px-5 py-3 border-b shrink-0 glass backdrop-blur-md z-30 prismpane-toolbar"
      style={{
        backgroundColor: `color-mix(in srgb, var(--toolbar-bg) 85%, transparent)`,
        borderColor: 'var(--toolbar-border)',
      }}
      role="toolbar"
      aria-label="Document toolbar"
    >
      {showFileToolbar && (
        <>
          {/* File actions (New, Open, Open Folder, Save) */}
          <div className="btn-group flex items-center gap-1.5" role="group" aria-label="File actions">
        <button
          onClick={onNewFile}
          className={cn(
            'btn btn-icon inline-flex items-center justify-center px-3 py-2 rounded-md',
            'transition-all duration-200',
            'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          style={{ color: 'var(--toolbar-fg)' }}
          title="New File (Ctrl+N)"
          aria-label="New File"
        >
          <IconFilePlus className="h-[18px] w-[18px]" stroke={1.5} />
        </button>
        <button
          onClick={onOpenFile}
          className={cn(
            'btn btn-icon inline-flex items-center justify-center px-3 py-2 rounded-md',
            'transition-all duration-200',
            'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          style={{ color: 'var(--toolbar-fg)' }}
          title="Open File (Ctrl+O)"
          aria-label="Open File"
        >
          <IconFileImport className="h-[18px] w-[18px]" stroke={1.5} />
        </button>
        <button
          onClick={onOpenFolder}
          className={cn(
            'btn btn-icon inline-flex items-center justify-center px-3 py-2 rounded-md',
            'transition-all duration-200',
            'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          style={{ color: 'var(--toolbar-fg)' }}
          title="Open Folder"
          aria-label="Open Folder"
        >
          <IconFolderOpen className="h-[18px] w-[18px]" stroke={1.5} />
        </button>
        <button
          onClick={onSaveFile}
          className={cn(
            'btn btn-icon inline-flex items-center justify-center px-3 py-2 rounded-md',
            'transition-all duration-200',
            'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          style={{ color: 'var(--toolbar-fg)' }}
          title="Save File (Ctrl+S)"
          aria-label="Save File"
        >
          <IconDeviceFloppy className="h-[18px] w-[18px]" stroke={1.5} />
        </button>
      </div>

      {showFormattingToolbar && (
        <div
          className="mx-1.5 h-5 w-px"
          style={{ backgroundColor: 'var(--toolbar-border)' }}
          role="separator"
          aria-orientation="vertical"
        />
      )}
      </>
      )}

      {showFormattingToolbar && documentType === 'markdown' && (
        <>
      {/* Heading dropdown */}
      <div className="relative" ref={headingRef}>
        <button
          onClick={() => setHeadingOpen((prev) => !prev)}
          className={cn(
            'btn btn-sm inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg',
            'transition-all duration-200',
            'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          style={{ color: 'var(--toolbar-fg)' }}
          title="Heading"
          aria-label="Heading"
          aria-haspopup="true"
          aria-expanded={headingOpen}
        >
          <span className="text-[15px] font-bold leading-none">H</span>
          <IconChevronDown className="h-[12px] w-[12px]" strokeWidth={2} />
        </button>

        {headingOpen && (
          <div
            className="dropdown-menu show absolute top-full left-0 mt-1 py-1.5 min-w-[160px] rounded-lg shadow-xl border z-50"
            style={{
              backgroundColor: 'var(--toolbar-bg)',
              borderColor: 'var(--toolbar-border)',
              color: 'var(--toolbar-fg)',
            }}
            role="menu"
          >
            {HEADING_OPTIONS.map((opt) => (
              <button
                key={opt.blockType}
                onClick={() => handleHeadingSelect(opt.blockType)}
                className={cn(
                  'dropdown-item w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md',
                  'transition-all duration-150',
                  'hover:bg-white/10',
                )}
                role="menuitem"
                title={`${opt.label}${opt.shortcut ? ` (${opt.shortcut})` : ''}`}
              >
                <opt.icon className="h-[16px] w-[16px]" strokeWidth={1.5} />
                <span className="flex-1 text-left">{opt.label}</span>
                {opt.shortcut && (
                  <span className="text-[10px] opacity-40 font-mono">{opt.shortcut}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Block formatting tools */}
      {TOOLS.map((tool) => (
        <button
          key={tool.blockType}
          onClick={() => handleClick(tool.blockType)}
          className={cn(
            'btn btn-sm inline-flex items-center justify-center px-3 py-2.5 rounded-lg',
            'transition-all duration-200',
            'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
          style={{ color: 'var(--toolbar-fg)' }}
          title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
          aria-label={tool.label}
        >
          <tool.icon className="h-[20px] w-[20px]" strokeWidth={1.5} />
        </button>
      ))}

      <div
        className="mx-1.5 h-5 w-px"
        style={{ backgroundColor: 'var(--toolbar-border)' }}
        role="separator"
        aria-orientation="vertical"
      />

      {/* Inline formatting */}
      <button
        onClick={() => handleInlineFormat('**')}
        className={cn(
          'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
          'transition-all duration-200',
          'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={{ color: 'var(--toolbar-fg)' }}
        title="Bold (Ctrl+B)"
        aria-label="Bold"
      >
        <IconBold className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>

      <button
        onClick={() => handleInlineFormat('*')}
        className={cn(
          'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
          'transition-all duration-200',
          'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={{ color: 'var(--toolbar-fg)' }}
        title="Italic (Ctrl+I)"
        aria-label="Italic"
      >
        <IconItalic className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>

      <button
        onClick={() => handleInlineFormat('~~')}
        className={cn(
          'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
          'transition-all duration-200',
          'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={{ color: 'var(--toolbar-fg)' }}
        title="Strikethrough"
        aria-label="Strikethrough"
      >
        <IconStrikethrough className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>

      <div
        className="mx-1.5 h-5 w-px"
        style={{ backgroundColor: 'var(--toolbar-border)' }}
        role="separator"
        aria-orientation="vertical"
      />

      {/* Insert dropdown */}
      <div className="relative" ref={insertRef}>
        <button
          onClick={() => setInsertOpen((prev) => !prev)}
          className={cn(
            'btn btn-sm inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg',
            'transition-all duration-200',
            'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          style={{ color: 'var(--toolbar-fg)' }}
          title="Insert"
          aria-haspopup="true"
          aria-expanded={insertOpen}
        >
          <IconCirclePlus className="h-[18px] w-[18px]" strokeWidth={1.5} />
          <IconChevronDown className="h-[12px] w-[12px]" strokeWidth={2} />
        </button>

        {insertOpen && (
          <div
            className="dropdown-menu show absolute top-full left-0 mt-1 p-3 min-w-[280px] rounded-lg shadow-xl border z-50 flex flex-col gap-3"
            style={{
              backgroundColor: 'var(--toolbar-bg)',
              borderColor: 'var(--toolbar-border)',
              color: 'var(--toolbar-fg)',
            }}
          >
             <div className="flex gap-1 border-b pb-2" style={{ borderColor: 'var(--toolbar-border)' }}>
                {(['link', 'file', 'folder'] as const).map(type => (
                   <button
                     key={type}
                     onClick={() => { setInsertType(type); setInsertValue(''); }}
                     className={cn(
                       "btn btn-sm px-3 py-1.5 text-xs rounded transition-colors capitalize",
                       insertType === type ? "bg-white/10" : "hover:bg-white/5 opacity-70"
                     )}
                   >
                     {type}
                   </button>
                ))}
             </div>
             
             <div className="flex flex-col gap-1.5">
               <label className="text-xs opacity-70">Name</label>
               <input
                 type="text"
                 value={insertName}
                 onChange={e => setInsertName(e.target.value)}
                 className="form-control px-2 py-1.5 text-sm rounded border bg-transparent outline-none focus:border-white/40"
                 style={{ borderColor: 'var(--toolbar-border)' }}
                 placeholder="Display text..."
               />
             </div>
             
             <div className="flex flex-col gap-1.5">
               <label className="text-xs opacity-70">{insertType === 'link' ? 'URL' : 'Path'}</label>
               <div className="flex gap-2">
                 <input
                   type="text"
                   value={insertValue}
                   onChange={e => setInsertValue(e.target.value)}
                   className="form-control flex-1 min-w-0 px-2 py-1.5 text-sm rounded border bg-transparent outline-none focus:border-white/40"
                   style={{ borderColor: 'var(--toolbar-border)' }}
                   placeholder={insertType === 'link' ? "https://..." : "Select..."}
                 />
                 {insertType !== 'link' && (
                   <button
                     onClick={handleBrowse}
                     className="btn btn-sm px-3 py-1.5 text-xs rounded border hover:bg-white/10 transition-colors shrink-0"
                     style={{ borderColor: 'var(--toolbar-border)' }}
                   >
                     Browse
                   </button>
                 )}
               </div>
             </div>
             
             <div className="flex justify-end gap-2 mt-1">
               <button
                 onClick={() => setInsertOpen(false)}
                 className="btn btn-sm px-4 py-1.5 text-xs rounded hover:bg-white/10 transition-colors opacity-80"
               >
                 Cancel
               </button>
               <button
                 onClick={executeInsert}
                 disabled={!insertValue}
                 className="btn btn-sm px-4 py-1.5 text-xs rounded transition-colors disabled:opacity-50"
                 style={{ backgroundColor: 'var(--sidebar-active)', color: '#000' }}
               >
                 Insert
               </button>
             </div>
          </div>
        )}
      </div>

      <button
        onClick={() => handleCommand('insertImage')}
        className={cn(
          'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
          'transition-all duration-200',
          'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={{ color: 'var(--toolbar-fg)' }}
        title="Insert Image"
      >
        <IconPhoto className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>

      <button
        onClick={() => handleCommand('insertTable')}
        className={cn(
          'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
          'transition-all duration-200',
          'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={{ color: 'var(--toolbar-fg)' }}
        title="Insert Table"
      >
        <IconTable className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>

      <button
        onClick={() => handleCommand('toggleTask')}
        className={cn(
          'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
          'transition-all duration-200',
          'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        style={{ color: 'var(--toolbar-fg)' }}
        title="Toggle Task List"
      >
        <IconCheckbox className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>
      </>
      )}

      {showFormattingToolbar && documentType === 'json' && (
        <div className="btn-group flex items-center gap-1.5" role="group" aria-label="JSON formatting actions">
          <button
            onClick={() => handleCommand('expandCollapseAllJson')}
            className={cn(
              'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
              'transition-all duration-200',
              'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            style={{ color: 'var(--toolbar-fg)' }}
            title="Expand/Collapse All"
            aria-label="Expand/Collapse All"
          >
            <IconFold className="h-[18px] w-[18px]" stroke={1.5} />
          </button>
          
          <button
            onClick={() => handleCommand('minifyPrettifyJson')}
            className={cn(
              'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
              'transition-all duration-200',
              'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            style={{ color: 'var(--toolbar-fg)' }}
            title="Minify/Prettify"
            aria-label="Minify/Prettify"
          >
            <IconWand className="h-[18px] w-[18px]" stroke={1.5} />
          </button>

          <button
            onClick={() => handleCommand('sortJsonKeys')}
            className={cn(
              'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
              'transition-all duration-200',
              'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            style={{ color: 'var(--toolbar-fg)' }}
            title="Sort Keys Alphabetically"
            aria-label="Sort Keys Alphabetically"
          >
            <IconSortAscendingLetters className="h-[18px] w-[18px]" stroke={1.5} />
          </button>

          <button
            onClick={() => handleCommand('generateJsonSchema')}
            className={cn(
              'btn btn-sm inline-flex items-center justify-center px-3 py-2 rounded-md',
              'transition-all duration-200',
              'hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            style={{ color: 'var(--toolbar-fg)' }}
            title="Auto-Generate Schema"
            aria-label="Auto-Generate Schema"
          >
            <IconSchema className="h-[18px] w-[18px]" stroke={1.5} />
          </button>
        </div>
      )}

      <div className="flex-1" />
    </div>
  );
});

export default Toolbar;