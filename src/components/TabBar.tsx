// ============================================================
// PrismPane — File Tab Bar (drags to reorder, double-click rename)
// ============================================================

import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { IconX } from '@tabler/icons-react';
import { cn } from './ui/utils';
import { Modal } from './ui/Modal';
import { getDisplayName } from '../fileUtils';

export interface TabFile {
  id: string;
  name: string;
  isDirty: boolean;
}

interface TabBarProps {
  files: TabFile[];
  activeFileId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabRename: (id: string, newName: string) => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  tabSavedColor: string;
  tabUnsavedColor: string;
  tabSavedTextColor: string;
  tabUnsavedTextColor: string;
  activeTabColor: string;
  inactiveTabColor: string;
  tabBarBackground: string;
  tabBarBorder: string;
}

// ─── Unsaved Changes Confirmation Dialog ───────────────────

function UnsavedDialog({
  fileName,
  onSaveAndClose,
  onCloseWithoutSaving,
  onCancel,
}: {
  fileName: string;
  onSaveAndClose: () => void;
  onCloseWithoutSaving: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title="Unsaved Changes"
      onClose={onCancel}
      widthClass="w-[min(50vw,420px)] max-w-[50vw]"
      heightClass="h-auto max-h-[80vh]"
      bodyClassName="p-0 overflow-hidden flex flex-col"
    >
      <div className="px-6 py-6 flex flex-col gap-1.5">
        <p className="text-sm opacity-80 leading-relaxed">
          <strong className="font-semibold" style={{ color: 'var(--active-tab-color)' }}>
            {getDisplayName(fileName)}
          </strong>{' '}
          has unsaved changes. Do you want to save them before closing?
        </p>
      </div>
      <div
        className="flex items-center justify-between px-6 py-4 bg-black/20 border-t mt-auto"
        style={{ borderColor: 'color-mix(in srgb, var(--toolbar-border) 30%, transparent)' }}
      >
        <button
          onClick={onCloseWithoutSaving}
          className="px-4 py-2 text-sm font-medium rounded-lg text-red-400/80 hover:text-red-400 hover:bg-red-500/15 transition-colors"
        >
          Discard
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-white/10 opacity-80 hover:opacity-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSaveAndClose}
            className="px-5 py-2 text-sm font-bold rounded-lg transition-all duration-200 active:scale-95 shadow-md hover:brightness-110"
            style={{
              backgroundColor: 'var(--active-tab-color)',
              color: '#000',
            }}
          >
            Save & Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── TabBar Component ──────────────────────────────────────

const TabBar = memo(function TabBar({
  files,
  activeFileId,
  onTabSelect,
  onTabClose,
  onTabRename,
  onTabReorder,
  tabSavedColor,
  tabUnsavedColor,
  tabSavedTextColor,
  tabUnsavedTextColor,
  activeTabColor,
  inactiveTabColor,
  tabBarBackground,
  tabBarBorder,
}: TabBarProps) {
  const [pendingClose, setPendingClose] = useState<TabFile | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ─── Drag state ──────────────────────────────────────────
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const handleCloseClick = useCallback(
    (e: React.MouseEvent, file: TabFile) => {
      e.stopPropagation();
      if (file.isDirty) {
        setPendingClose(file);
      } else {
        onTabClose(file.id);
      }
    },
    [onTabClose],
  );

  const handleSaveAndClose = useCallback(() => {
    if (pendingClose) {
      window.dispatchEvent(
        new CustomEvent('prismpane:saveAndClose', { detail: pendingClose.id }),
      );
      setPendingClose(null);
    }
  }, [pendingClose]);

  const handleDiscardAndClose = useCallback(() => {
    if (pendingClose) {
      onTabClose(pendingClose.id);
      setPendingClose(null);
    }
  }, [pendingClose, onTabClose]);

  const handleCancelClose = useCallback(() => {
    setPendingClose(null);
  }, []);

  // ─── Double-click rename ─────────────────────────────────
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, file: TabFile) => {
      e.stopPropagation();
      setRenamingId(file.id);
      setRenameValue(getDisplayName(file.name));
      setTimeout(() => renameInputRef.current?.select(), 10);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onTabRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, onTabRename]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename();
      } else if (e.key === 'Escape') {
        setRenamingId(null);
      }
    },
    [commitRename],
  );

  // ─── Drag handlers ───────────────────────────────────────
  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index;
  }, []);

  const handleDragEnter = useCallback((index: number) => {
    dragOverItemRef.current = index;
  }, []);

  const handleDragEnd = useCallback(() => {
    const from = dragItemRef.current;
    const to = dragOverItemRef.current;
    if (from !== null && to !== null && from !== to) {
      onTabReorder(from, to);
    }
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  }, [onTabReorder]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <>
      <div
        className="prismpane-tabbar flex items-end gap-0 shrink-0 overflow-x-auto px-2 pt-1"
        style={{
          backgroundColor: tabBarBackground,
          borderBottom: `1px solid ${tabBarBorder}`,
          scrollbarWidth: 'thin',
        }}
        role="tablist"
        aria-label="Open files"
      >
        {files.map((file, index) => {
          const isActive = file.id === activeFileId;
          const dotColor = file.isDirty ? tabUnsavedColor : tabSavedColor;
          const textColor = file.isDirty ? tabUnsavedTextColor : tabSavedTextColor;

          return (
            <button
              key={file.id}
              onClick={() => onTabSelect(file.id)}
              onDoubleClick={(e) => handleDoubleClick(e, file)}
              role="tab"
              aria-selected={isActive}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              className={cn(
                'group relative flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium leading-tight',
                'transition-colors duration-150 whitespace-nowrap select-none',
                'min-w-0 max-w-[220px] border border-b-0 rounded-t-sm',
                isActive
                  ? 'cursor-default z-10 -mb-px'
                  : 'opacity-78 hover:opacity-100 cursor-pointer mt-0.5',
              )}
              style={{
                color: isActive ? activeTabColor : textColor,
                backgroundColor: isActive ? 'var(--editor-bg)' : 'color-mix(in srgb, var(--toolbar-bg) 86%, transparent)',
                borderColor: isActive ? tabBarBorder : `${tabBarBorder}66`,
              }}
              title={renamingId !== file.id ? getDisplayName(file.name) : undefined}
            >
              {/* State indicator dot */}
              <span
                className="shrink-0 inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: dotColor }}
                aria-label={file.isDirty ? 'Unsaved changes' : 'Saved'}
              />

              {/* File name or rename input */}
              {renamingId === file.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={handleRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-b border-current outline-none text-xs font-medium w-24"
                  style={{ color: activeTabColor }}
                  maxLength={60}
                />
              ) : (
                <span className="truncate">{getDisplayName(file.name)}</span>
              )}

              {/* Close button */}
              <span
                onClick={(e) => handleCloseClick(e, file)}
                className={cn(
                  'inline-flex items-center justify-center w-4 h-4 rounded-sm shrink-0',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'hover:bg-white/20',
                  isActive && 'opacity-50',
                )}
                role="button"
                aria-label={`Close ${file.name}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCloseClick(e as unknown as React.MouseEvent, file);
                  }
                }}
              >
                <IconX className="h-3.5 w-3.5" stroke={1.75} />
              </span>
            </button>
          );
        })}

        {files.length === 0 && (
          <div className="px-4 py-2 text-[10px] opacity-30 italic select-none">
            No open files
          </div>
        )}
      </div>

      {pendingClose && (
        <UnsavedDialog
          fileName={pendingClose.name}
          onSaveAndClose={handleSaveAndClose}
          onCloseWithoutSaving={handleDiscardAndClose}
          onCancel={handleCancelClose}
        />
      )}
    </>
  );
});

export default TabBar;