import React, { useEffect, useRef } from 'react';
import { IconX } from '@tabler/icons-react';
import { cn } from './utils';

export interface ModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  widthClass?: string;
  heightClass?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  hideHeader?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen = true,
  onClose,
  title,
  icon,
  headerRight,
  children,
  className,
  bodyClassName,
  widthClass = 'w-[50vw] max-w-[50vw]',
  heightClass = 'h-[80vh] max-h-[80vh]',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  hideHeader = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleOverlayClick}
      style={{ cursor: 'default' }}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'prismpane-modal bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl text-slate-100 flex flex-col font-sans animate-in fade-in zoom-in-95 duration-150 box-border overflow-hidden',
          widthClass,
          heightClass,
          'max-w-[50vw] max-h-[80vh]',
          className
        )}
      >
        {!hideHeader && (title || icon || showCloseButton || headerRight) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0 bg-slate-900/80">
            <div className="flex items-center gap-2.5 font-medium text-base text-slate-100 min-w-0">
              {icon && <span className="shrink-0">{icon}</span>}
              {title && <span className="truncate">{title}</span>}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {headerRight}
              {showCloseButton && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
                  aria-label="Close dialog"
                >
                  <IconX className="w-4 h-4" stroke={1.75} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className={cn('flex-1 min-h-0 overflow-y-auto flex flex-col', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
