import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface Anchor { x: number; y: number; /** open upward from y2 if not enough space */ y2?: number }

export function anchorFromEl(el: HTMLElement | null | undefined): Anchor {
  if (!el) return { x: 200, y: 200 };
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4, y2: r.top - 4 };
}

export function anchorFromRect(r: DOMRect): Anchor {
  return { x: r.left, y: r.bottom + 6, y2: r.top - 6 };
}

/**
 * Generic anchored floating panel. Closes on outside pointerdown / Escape.
 * Keeps itself inside the viewport.
 */
export function Popover({
  anchor, onClose, children, className = '', width,
  closeOnEsc = true, autoFocus = false,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
  closeOnEsc?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = anchor.x;
    let top = anchor.y;
    if (left + rect.width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - rect.width - 12);
    if (top + rect.height > window.innerHeight - 12) {
      const upTop = (anchor.y2 ?? anchor.y) - rect.height;
      top = upTop > 12 ? upTop : Math.max(12, window.innerHeight - rect.height - 12);
    }
    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    // defer so the opening click doesn't instantly close it
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
    }, 10);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose, closeOnEsc]);

  useEffect(() => {
    if (autoFocus) ref.current?.querySelector<HTMLElement>('input,textarea,[contenteditable]')?.focus();
  }, [autoFocus]);

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={{
        left: pos?.left ?? anchor.x,
        top: pos?.top ?? anchor.y,
        width,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
