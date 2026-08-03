// ============================================================
// PrismPane — Application Menu Bar
// ============================================================

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { IconChevronRight, IconCheck } from '@tabler/icons-react';
import { cn } from './ui/utils';
import { TEMPLATES } from '../features/formatters/templates';
import type { Template } from '../types';

// ─── Types ────────────────────────────────────────────────

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
}

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

// ─── Dropdown Component ───────────────────────────────────

function DropdownMenu({
  items,
  onClose,
  menuBarBg,
  menuBarBorder,
  menuBarFg,
  menuLabel,
}: {
  items: MenuItem[];
  onClose: () => void;
  menuBarBg: string;
  menuBarBorder: string;
  menuBarFg: string;
  menuLabel?: string;
}) {
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);
  const [submenuOpenLeft, setSubmenuOpenLeft] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasSubmenus = items.some(item => item.submenu && item.submenu.length > 0);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close from the trigger click
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      if (item.submenu) return; // handled by hover
      item.action?.();
      onClose();
    },
    [onClose],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={cn(
        'dropdown-menu show absolute top-full left-0 z-50 min-w-[210px] max-w-[min(360px,calc(100vw-12px))] rounded-md py-1 glass mt-0.5 transition-all duration-150 ease-out',
        (menuLabel === 'Edit' || hasSubmenus)
          ? 'overflow-visible max-h-none'
          : 'overflow-y-auto max-h-[min(72vh,560px)]',
      )}
      style={{
        backgroundColor: menuBarBg,
        border: `1px solid ${menuBarBorder}`,
        color: menuBarFg,
      }}
      role="menu"
      onMouseLeave={() => setSubmenuIndex(null)}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${i}`}
              className="my-2 border-t"
              style={{ borderColor: menuBarBorder }}
            />
          );
        }
        const hasSub = !!item.submenu && item.submenu.length > 0;
        return (
          <div 
            key={i} 
            className="relative"
            onMouseEnter={(e) => {
              if (!hasSub) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              setSubmenuOpenLeft(rect.right + 230 > window.innerWidth - 8);
              setSubmenuIndex(i);
            }}
          >
            <button
              className={cn(
                'dropdown-item w-full flex items-center justify-between px-2.5 py-1.5 text-[12px] leading-none text-left rounded-sm',
                'hover:bg-white/10 transition-colors',
                item.disabled && 'opacity-30 pointer-events-none',
              )}
              onClick={() => !hasSub && handleItemClick(item)}
              role="menuitem"
              disabled={item.disabled}
            >
              <span className="flex items-center gap-2">
                {item.checked !== undefined && (
                  item.checked ? <IconCheck className="h-3.5 w-3.5" stroke={1.75} /> : <span className="h-3.5 w-3.5 inline-block" />
                )}
                <span>{item.label}</span>
              </span>
              <span className="flex items-center gap-1 ml-4">
                {item.shortcut && (
                  <span className="text-[10px] opacity-40">{item.shortcut}</span>
                )}
                {hasSub && <IconChevronRight className="h-3 w-3 opacity-40" stroke={1.75} />}
              </span>
            </button>
            {hasSub && submenuIndex === i && (
              <div
                className={cn(
                  'dropdown-menu show absolute top-[-2px] z-50 min-w-[210px] max-w-[min(340px,calc(100vw-12px))] rounded-md py-1 glass transition-all duration-150 ease-out overflow-y-auto max-h-[min(70vh,540px)]',
                  submenuOpenLeft ? 'right-full mr-1' : 'left-full ml-1',
                )}
                style={{
                  backgroundColor: menuBarBg,
                  border: `1px solid ${menuBarBorder}`,
                  color: menuBarFg,
                }}
                role="menu"
              >
                {item.submenu!.map((sub, j) =>
                  sub.separator ? (
                    <div
                      key={`subsep-${j}`}
                      className="my-1.5 border-t"
                      style={{ borderColor: menuBarBorder }}
                    />
                  ) : (
                    <button
                      key={j}
                      className={cn(
                        'dropdown-item w-full flex items-center justify-between px-2.5 py-1.5 text-[12px] leading-none text-left rounded-sm',
                        'hover:bg-white/10 transition-colors',
                        sub.disabled && 'opacity-30 pointer-events-none',
                      )}
                      onClick={() => handleItemClick(sub)}
                      role="menuitem"
                      disabled={sub.disabled}
                    >
                      <span className="flex items-center gap-2">
                        {sub.checked !== undefined && (
                          sub.checked ? <IconCheck className="h-3.5 w-3.5" stroke={1.75} /> : <span className="h-3.5 w-3.5 inline-block" />
                        )}
                        <span>{sub.label}</span>
                      </span>
                      {sub.shortcut && (
                        <span className="text-[10px] opacity-40">{sub.shortcut}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MenuBar Component ────────────────────────────────────

interface MenuBarProps {
  menus: MenuDef[];
  menuBarBg: string;
  menuBarBorder: string;
  menuBarFg: string;
  menuBarHover: string;
}

const MenuBar = memo(function MenuBar({
  menus,
  menuBarBg,
  menuBarBorder,
  menuBarFg,
  menuBarHover,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const handleMenuToggle = useCallback((index: number) => {
    setOpenMenu((prev) => (prev === index ? null : index));
  }, []);

  // Close when clicking outside the bar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Hover between menus when one is open
  const handleMenuHover = useCallback((index: number) => {
    if (openMenu !== null) {
      setOpenMenu(index);
    }
  }, [openMenu]);

  return (
    <div
      ref={barRef}
      className="flex items-center shrink-0 px-1.5 py-0 gap-0.5 z-40 prismpane-menubar"
      style={{
        backgroundColor: menuBarBg,
        color: menuBarFg,
      }}
      role="menubar"
    >
      {menus.map((menu, i) => (
        <div key={i} className="relative">
          <button
              className={cn(
                'px-2 py-1 text-[12px] leading-tight font-normal rounded-sm transition-colors',
                openMenu === i ? 'bg-white/12' : 'hover:bg-white/8',
              )}
            onClick={() => handleMenuToggle(i)}
            onMouseEnter={() => handleMenuHover(i)}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={openMenu === i}
          >
            {menu.label}
          </button>
          {openMenu === i && (
            <DropdownMenu
              items={menu.items}
              onClose={() => setOpenMenu(null)}
              menuBarBg={menuBarBg}
              menuBarBorder={menuBarBorder}
              menuBarFg={menuBarFg}
              menuLabel={menu.label}
            />
          )}
        </div>
      ))}
    </div>
  );
});

export default MenuBar;