import React, { useState, useEffect, useRef } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { getThemeById } from '../features/editor/themes';
import { Modal } from './ui/Modal';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: { label: string; action: () => void; shortcut?: string; description?: string }[];
  themeId: string;
  placeholder?: string;
  emptyMessage?: string;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  items,
  themeId,
  placeholder = 'Type a command or search...',
  emptyMessage = 'No matching items found',
}) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const theme = getThemeById(themeId);
  const c = theme.colors;

  const filteredItems = items.filter((item) =>
    `${item.label} ${item.description ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hideHeader
      widthClass="w-[50vw] max-w-[50vw]"
      heightClass="h-[min(80vh,460px)] max-h-[80vh]"
      className="prismpane-command-palette"
      bodyClassName="p-0 overflow-hidden flex flex-col"
    >
      <div
        className="flex flex-col h-full"
        style={{
          backgroundColor: c.sidebarBackground,
          color: c.sidebarForeground,
        }}
      >
        <div className="flex items-center px-4 py-3 border-b shrink-0" style={{ borderColor: `${c.sidebarForeground}15` }}>
          <IconSearch className="w-5 h-5 opacity-50 mr-3" stroke={1.75} />
          <input
            ref={inputRef}
            type="text"
            className="form-control form-control-plaintext flex-1 bg-transparent border-none outline-none text-base"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ color: c.sidebarForeground }}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, idx) => (
              <button
                key={idx}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left text-[13px] transition-colors"
                style={{
                  backgroundColor: idx === selectedIndex ? `${c.sidebarForeground}15` : 'transparent',
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  item.action();
                  onClose();
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{item.label}</div>
                  {item.description && (
                    <div className="truncate text-[11px] opacity-45">{item.description}</div>
                  )}
                </div>
                {item.shortcut && (
                  <span className="shrink-0 text-[10px] opacity-40 font-mono tracking-wider">{item.shortcut}</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-[13px] opacity-50">
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CommandPalette;
