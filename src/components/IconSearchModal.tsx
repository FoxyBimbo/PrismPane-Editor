import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconSearch, IconX, IconCheck, IconCopy, IconFileImport, IconChevronDown } from '@tabler/icons-react';
import { Modal } from './ui/Modal';
import type { IconPackageKey } from '../types';
import { ICON_PACKAGES, getPhosphorIconClasses } from '../features/editor/iconPackages';

export interface IconSearchModalProps {
  onClose: () => void;
  onInsertIcon?: (iconName: string) => void;
}

type SelectedPackageOption = 'all' | Exclude<IconPackageKey, 'off'>;

interface IconItem {
  name: string;
  packageKey: Exclude<IconPackageKey, 'off'>;
  packageName: string;
}

const INITIAL_LIMIT = 320;
const LIMIT_STEP = 320;

export const IconSearchModal: React.FC<IconSearchModalProps> = ({
  onClose,
  onInsertIcon,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedPackage, setSelectedPackage] = useState<SelectedPackageOption>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<IconItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(INITIAL_LIMIT);

  // Flatten all icons across packages into a single list for 'all' mode
  const allIconItems = useMemo<IconItem[]>(() => {
    const list: IconItem[] = [];
    (Object.keys(ICON_PACKAGES) as Exclude<IconPackageKey, 'off'>[]).forEach((pkgKey) => {
      const pkg = ICON_PACKAGES[pkgKey];
      pkg.icons.forEach((name) => {
        list.push({
          name,
          packageKey: pkgKey,
          packageName: pkg.name,
        });
      });
    });
    return list;
  }, []);

  // Filter icons based on search term and active package selection
  const filteredIcons = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let baseList: IconItem[] = [];
    if (selectedPackage === 'all') {
      baseList = allIconItems;
    } else {
      const pkg = ICON_PACKAGES[selectedPackage];
      if (pkg) {
        baseList = pkg.icons.map((name) => ({
          name,
          packageKey: selectedPackage,
          packageName: pkg.name,
        }));
      }
    }

    if (!term) {
      return baseList;
    }

    return baseList.filter((item) => item.name.toLowerCase().includes(term));
  }, [allIconItems, selectedPackage, searchTerm]);

  // Reset display limit when filter or package changes
  useEffect(() => {
    setDisplayLimit(INITIAL_LIMIT);
  }, [selectedPackage, searchTerm]);

  const visibleIcons = useMemo(() => {
    return filteredIcons.slice(0, displayLimit);
  }, [filteredIcons, displayLimit]);

  // Focus search box on mount
  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const renderIconPreview = (pkgKey: Exclude<IconPackageKey, 'off'>, name: string) => {
    switch (pkgKey) {
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
      title="Icon Search"
      icon={<IconSearch className="w-5 h-5 text-blue-400" />}
      headerRight={
        <span className="text-xs text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-full font-mono border border-slate-700/50">
          {filteredIcons.length.toLocaleString()} icons
        </span>
      }
      onClose={onClose}
      widthClass="w-[50vw] max-w-[50vw]"
      heightClass="h-[80vh] max-h-[80vh]"
      className="prismpane-icon-search-modal"
      bodyClassName="p-6 gap-4 font-sans overflow-hidden flex flex-col"
    >
        {/* Controls: Real-time Search Box + Package Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          {/* Search Box */}
          <div className="relative flex-1">
            <IconSearch className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search 46,000+ icons across all packages (e.g. anchor, house, arrow, user)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none rounded-lg pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
              >
                <IconX className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Package Dropdown */}
          <select
            value={selectedPackage}
            onChange={(e) => setSelectedPackage(e.target.value as SelectedPackageOption)}
            className="bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-slate-200 cursor-pointer"
          >
            <option value="all">All Packages</option>
            <option value="phosphor">Phosphor Icons (Default)</option>
            <option value="bootstrap">Bootstrap</option>
            <option value="lucide">Lucide</option>
            <option value="iconoir">Iconoir</option>
            <option value="tabler">Tabler</option>
            <option value="material">Google Material Symbols</option>
            <option value="boxicons">Boxicons</option>
          </select>
        </div>

        {/* Icons Grid Container - Strictly constrained to container width with vertical scroll */}
        <div className="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden border border-slate-800/80 rounded-xl p-3 bg-slate-950/60 flex flex-col gap-2 box-border">
          {visibleIcons.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-500 text-xs gap-1">
              <span>No icons found matching &quot;{searchTerm}&quot;</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 w-full max-w-full box-border shrink-0">
              {visibleIcons.map((item, idx) => {
                const isSelected = selectedItem?.name === item.name && selectedItem?.packageKey === item.packageKey;
                return (
                  <button
                    key={`${item.packageKey}-${item.name}-${idx}`}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    onDoubleClick={() => {
                      setSelectedItem(item);
                      if (onInsertIcon) {
                        onInsertIcon(item.name);
                        onClose();
                      } else {
                        handleCopy(item.name);
                      }
                    }}
                    title={`${item.name} (${item.packageName})`}
                    className={`aspect-square w-full min-w-0 flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all border text-center box-border overflow-hidden ${
                      isSelected
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-md ring-1 ring-blue-500/50'
                        : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="h-9 flex items-center justify-center shrink-0">
                      {renderIconPreview(item.packageKey, item.name)}
                    </div>
                    <span className="text-[10px] font-mono truncate w-full px-0.5 leading-tight font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                      {item.name}
                    </span>
                    {selectedPackage === 'all' && (
                      <span className="text-[9px] font-sans text-slate-400 truncate w-full px-0.5 leading-none opacity-80 overflow-hidden text-ellipsis whitespace-nowrap">
                        {item.packageName.replace(' Icons', '')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Load More Button */}
          {filteredIcons.length > displayLimit && (
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <button
                type="button"
                onClick={() => setDisplayLimit((prev) => prev + LIMIT_STEP)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer border border-slate-700/60 shadow-md"
              >
                <IconChevronDown className="w-4 h-4" />
                <span>Show More Icons ({(filteredIcons.length - displayLimit).toLocaleString()} remaining)</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 shrink-0">
          <div className="text-xs text-slate-400 font-mono truncate max-w-[340px]">
            {selectedItem ? (
              <span>
                Selected: <strong className="text-blue-300">{selectedItem.name}</strong> ({selectedItem.packageName})
              </span>
            ) : (
              <span>Showing {visibleIcons.length.toLocaleString()} of {filteredIcons.length.toLocaleString()} icons</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => selectedItem && handleCopy(selectedItem.name)}
              disabled={!selectedItem}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            >
              {copied ? <IconCheck className="w-4 h-4 text-green-400" /> : <IconCopy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy Name'}</span>
            </button>

            {onInsertIcon && (
              <button
                type="button"
                onClick={() => {
                  if (selectedItem) {
                    onInsertIcon(selectedItem.name);
                    onClose();
                  }
                }}
                disabled={!selectedItem}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium shadow-md shadow-blue-900/30 transition-colors cursor-pointer"
              >
                <IconFileImport className="w-4 h-4" />
                <span>Insert</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
    </Modal>
  );
};
