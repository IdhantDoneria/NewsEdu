import { ArchiveRestore, Trash2, X } from 'lucide-react';
import { destroyPage, getTrashed, openPage, restorePage, setTrashOpen, useStore } from '../../lib/store';
import { timeAgo } from '../editor/editorUtils';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';

export function TrashPanel() {
  const open = useStore((s) => s.trashOpen);
  useStore((s) => s.navTick);
  if (!open) return null;
  const items = getTrashed();
  const close = () => setTrashOpen(false);

  return (
    <Modal narrow onClose={close}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ fontWeight: 650, fontSize: 15.5, flex: 1 }}>🗑️ Trash</div>
        {items.length > 0 && (
          <button className="btn small danger" onClick={() => {
            if (confirm(`Permanently delete ${items.length} page(s)? This cannot be undone.`)) {
              items.forEach((p) => destroyPage(p.id));
              toast('Trash emptied');
            }
          }}>
            Empty trash
          </button>
        )}
        <button className="icon-btn" onClick={close} style={{ marginLeft: 6 }}><X size={17} /></button>
      </div>
      <div style={{ overflowY: 'auto', padding: 8, minHeight: 200, maxHeight: 460 }}>
        {items.length === 0 && (
          <div className="empty-state"><div className="big">🕊️</div><div>Trash is empty. Pristine.</div></div>
        )}
        {items.map((p) => (
          <div key={p.id} className="menu-item" style={{ padding: '8px 10px' }}>
            <span className="mi-icon" style={{ fontSize: 15 }}>{p.icon ?? '📄'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="mi-label" style={{ display: 'block' }}>{p.title || 'Untitled'}</span>
              <span className="mi-desc">deleted {timeAgo(p.deletedAt ?? 0)}</span>
            </span>
            <button className="icon-btn small" title="Restore" onClick={() => {
              restorePage(p.id);
              toast('Page restored', 'Open', () => { openPage(p.id); close(); });
            }}>
              <ArchiveRestore size={15} />
            </button>
            <button className="icon-btn small" title="Delete forever" onClick={() => {
              if (confirm(`Permanently delete “${p.title || 'Untitled'}”?`)) destroyPage(p.id);
            }}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
