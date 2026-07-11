import { History, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listSnapshots, restoreSnapshot, saveSnapshot, setHistoryFor, useStore } from '../../lib/store';
import type { Snapshot } from '../../lib/types';
import { fmtDate } from '../editor/editorUtils';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';

export function HistoryPanel() {
  const pageId = useStore((s) => s.historyFor);
  const page = useStore((s) => (pageId ? s.pages[pageId] : undefined));
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [sel, setSel] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (pageId) {
      setSnaps(null);
      setSel(null);
      void listSnapshots(pageId).then((s) => { setSnaps(s); setSel(s[0] ?? null); });
    }
  }, [pageId]);

  if (!pageId || !page) return null;
  const close = () => setHistoryFor(null);

  const preview = (() => {
    if (!sel) return null;
    try {
      const data = JSON.parse(sel.data) as { blocks: Array<{ type: string; html: string }> };
      return data.blocks.slice(0, 14).map((b, i) => {
        const el = document.createElement('div');
        el.innerHTML = b.html;
        const text = el.textContent || (b.type === 'divider' ? '———' : `[${b.type}]`);
        return <div key={i} style={{
          fontSize: b.type.startsWith('h') ? 15.5 : 13.5,
          fontWeight: b.type.startsWith('h') ? 650 : 400,
          padding: '3px 0', color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{text || ' '}</div>;
      });
    } catch { return null; }
  })();

  return (
    <Modal onClose={close} className="" narrow={false}>
      <div style={{ width: 240, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', fontWeight: 650, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={16} /> Version history
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {snaps === null && <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>}
          {snaps?.length === 0 && <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>No versions yet — Zenith snapshots your work automatically as you edit.</div>}
          {snaps?.map((s) => (
            <button key={s.id} className={`menu-item ${sel?.id === s.id ? 'hl' : ''}`} onClick={() => setSel(s)}>
              <span style={{ minWidth: 0 }}>
                <span className="mi-label" style={{ display: 'block', fontWeight: 540 }}>{fmtDate(s.ts, true)}</span>
                <span className="mi-desc">{s.title}</span>
              </span>
            </button>
          ))}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--divider)' }}>
          <button className="btn small" style={{ width: '100%' }} onClick={async () => {
            await saveSnapshot(pageId);
            setSnaps(await listSnapshots(pageId));
            toast('Snapshot saved');
          }}>
            Snapshot now
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
            {sel ? `${page.icon ? page.icon + ' ' : ''}${sel.title} — ${fmtDate(sel.ts, true)}` : 'Select a version'}
          </div>
          {sel && (
            <button className="btn gold small" onClick={async () => {
              await restoreSnapshot(sel.id);
              toast('Version restored');
              close();
            }}>
              Restore this version
            </button>
          )}
          <button className="icon-btn" style={{ marginLeft: 8 }} onClick={close}><X size={17} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px' }}>
          {preview ?? <div style={{ color: 'var(--text-tertiary)', fontSize: 13.5 }}>Nothing to preview.</div>}
        </div>
      </div>
    </Modal>
  );
}
