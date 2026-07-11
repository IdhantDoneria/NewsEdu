import { useEffect, useState } from 'react';
import { Emitter } from '../../lib/events';

interface ToastMsg { id: number; text: string; actionLabel?: string; action?: () => void }
const bus = new Emitter<{ toast: ToastMsg }>();
let nextId = 1;

export function toast(text: string, actionLabel?: string, action?: () => void): void {
  bus.emit('toast', { id: nextId++, text, actionLabel, action });
}

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => bus.on('toast', (t) => {
    setItems((cur) => [...cur.slice(-2), t]);
    setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 3600);
  }), []);
  if (!items.length) return null;
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.actionLabel && (
            <button onClick={() => { t.action?.(); setItems((cur) => cur.filter((x) => x.id !== t.id)); }}>
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
