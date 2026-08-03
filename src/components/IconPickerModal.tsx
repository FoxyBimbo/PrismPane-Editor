import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconX, IconSearch, IconIcons, IconChevronDown, IconCopy, IconCheck, IconFileImport } from '@tabler/icons-react';
import { Modal } from './ui/Modal';
import type { IconPackageKey } from '../types';
import { ICON_PACKAGES, getPhosphorIconClasses } from '../features/editor/iconPackages';

export interface IconPickerModalProps {
  initialIcon: string;
  packageKey: Exclude<IconPackageKey, 'off'>;
  position: { top: number; left: number };
  onSave: (newIconName: string) => void;
  onDiscard: () => void;
}

const INITIAL_LIMIT = 150;
const LIMIT_STEP = 150;

export const IconPickerModal: React.FC<IconPickerModalProps> = ({
  initialIcon,
  packageKey,
  onSave,
  onDiscard,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedIcon, setSelectedIcon] = useState<string>(initialIcon);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [displayLimit, setDisplayLimit] = useState<number>(INITIAL_LIMIT);
  const [copied, setCopied] = useState<boolean>(false);

  const packageInfo = ICON_PACKAGES[packageKey];

  // Focus search box on mount
  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  }, []);

  // Keyboard shortcut for Enter key save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && selectedIcon) {
        e.preventDefault();
        onSave(selectedIcon);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave, selectedIcon]);

  const handleCopy = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter icons in real time
  const filteredIcons = useMemo(() => {
    if (!packageInfo) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return packageInfo.icons;
    return packageInfo.icons.filter((name) => name.toLowerCase().includes(term));
  }, [packageInfo, searchTerm]);

  // Reset limit on search term change
  useEffect(() => {
    setDisplayLimit(INITIAL_LIMIT);
  }, [searchTerm]);

  const visibleIcons = useMemo(() => {
    return filteredIcons.slice(0, displayLimit);
  }, [filteredIcons, displayLimit]);

  const renderIconPreview = (name: string) => {
    switch (packageKey) {
      case 'bootstrap':
        return <i className={`bi bi-${name} text-2xl`} />;
      case 'lucide':
        return <i className={`icon-${name} text-2xl`} />;
      case 'iconoir':
        return <i className={`iconoir-${name} text-2xl`} />;
      case 'tabler':
        return <i className={`ti ti-${name} text-2xl`} />;
      case 'material':
        return <span className="material-symbols-outlined text-2xl">{name.replace(/-/g, '_')}</span>;
      case 'boxicons':
        return <i className={`bx ${name.startsWith('bx') ? name : `bx-${name}`} text-2xl`} />;
      case 'phosphor':
        return <i className={`${getPhosphorIconClasses(name)} text-2xl`} />;
      default:
        return null;
    }
  };

  return (
    <Modal
      title="Select Icon"
      icon={<IconIcons className="w-4 h-4 text-blue-400" />}
      headerRight={
        <span className="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
          {packageInfo?.name}
        </span>
      }
      onClose={onDiscard}
      widthClass="w-[50vw] max-w-[50vw]"
      heightClass="h-[80vh] max-h-[80vh]"
      className="prismpane-icon-picker-modal"
      bodyClassName="p-4 gap-3 font-sans overflow-hidden flex flex-col"
    >
        {/* Real-Time Search Box */}
        <div className="relative shrink-0">
          <IconSearch className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={`Search ${packageInfo?.icons.length ?? 0} icons...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Icons Grid Container - Strictly constrained to container width */}
        <div className="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden border border-slate-800/80 rounded-lg p-2.5 bg-slate-950/60 flex flex-col gap-2 box-border">
          {visibleIcons.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-slate-500 text-xs gap-1">
              <span>No icons match &quot;{searchTerm}&quot;</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 w-full max-w-full box-border">
              {visibleIcons.map((iconName) => {
                const isSelected = selectedIcon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setSelectedIcon(iconName)}
                    onDoubleClick={() => {
                      setSelectedIcon(iconName);
                      onSave(iconName);
                    }}
                    title={iconName}
                    className={`aspect-square w-full min-w-0 flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-all border text-center box-border overflow-hidden ${
                      isSelected
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                        : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="h-9 flex items-center justify-center shrink-0">{renderIconPreview(iconName)}</div>
                    <span className="text-[10px] font-mono truncate w-full px-0.5 leading-tight opacity-90 overflow-hidden text-ellipsis whitespace-nowrap">
                      {iconName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Load More Button */}
          {filteredIcons.length > displayLimit && (
            <div className="pt-1 flex justify-center shrink-0">
              <button
                type="button"
                onClick={() => setDisplayLimit((prev) => prev + LIMIT_STEP)}
                className="flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer border border-slate-700/60"
              >
                <IconChevronDown className="w-3.5 h-3.5" />
                <span>Show More ({filteredIcons.length - displayLimit})</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 shrink-0">
          <div className="text-xs text-slate-400 font-mono truncate max-w-[280px]">
            {selectedIcon ? (
              <span>
                Selected: <strong className="text-blue-300">{selectedIcon}</strong> ({packageInfo?.name})
              </span>
            ) : (
              <span>Showing {visibleIcons.length.toLocaleString()} of {filteredIcons.length.toLocaleString()} icons</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => selectedIcon && handleCopy(selectedIcon)}
              disabled={!selectedIcon}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            >
              {copied ? <IconCheck className="w-4 h-4 text-green-400" /> : <IconCopy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy Name'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedIcon) {
                  onSave(selectedIcon);
                }
              }}
              disabled={!selectedIcon}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium shadow-md shadow-blue-900/30 transition-colors cursor-pointer"
            >
              <IconFileImport className="w-4 h-4" />
              <span>Insert</span>
            </button>

            <button
              type="button"
              onClick={onDiscard}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              <IconX className="w-4 h-4" />
              <span>Discard</span>
            </button>
          </div>
        </div>
    </Modal>
  );
};
