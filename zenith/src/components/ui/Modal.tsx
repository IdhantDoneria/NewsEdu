import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  onClose, children, narrow = false, className = '',
}: { onClose: () => void; children: ReactNode; narrow?: boolean; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${narrow ? 'narrow' : ''} ${className}`}>{children}</div>
    </div>,
    document.body,
  );
}
