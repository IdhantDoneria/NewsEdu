import { Check, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { addComment, deleteComment, getComments, setCommentsFor, updateComment, useStore } from '../../lib/store';
import { timeAgo } from '../editor/editorUtils';

export function CommentsPanel() {
  const pageId = useStore((s) => s.commentsFor);
  useStore((s) => (pageId ? s.pageTick[pageId] : 0));
  const page = useStore((s) => (pageId ? s.pages[pageId] : undefined));
  const [draft, setDraft] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  if (!pageId || !page) return null;

  const all = getComments(pageId);
  const items = all.filter((c) => showResolved || !c.resolved);
  const resolvedCount = all.filter((c) => c.resolved).length;
  const close = () => setCommentsFor(null);

  const submit = () => {
    if (!draft.trim()) return;
    addComment(pageId, draft.trim());
    setDraft('');
  };

  return (
    <>
      <div className="peek-overlay" style={{ background: 'transparent' }} onClick={close} />
      <div className="peek" style={{ width: 'min(380px, 86vw)' }}>
        <div className="peek-bar">
          <div style={{ fontWeight: 640, fontSize: 14.5, flex: 1, paddingLeft: 6 }}>
            💬 Comments · {page.title || 'Untitled'}
          </div>
          {resolvedCount > 0 && (
            <button className="btn small" onClick={() => setShowResolved(!showResolved)}>
              {showResolved ? 'Hide resolved' : `Resolved (${resolvedCount})`}
            </button>
          )}
          <button className="icon-btn" onClick={close}><X size={17} /></button>
        </div>
        <div className="peek-scroll" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.length === 0 && (
            <div className="empty-state" style={{ padding: '40px 12px' }}>
              <div className="big">💭</div>
              <div>No comments yet. Start the conversation.</div>
            </div>
          )}
          {items.map((c) => (
            <div key={c.id} style={{
              border: '1px solid var(--divider)', borderRadius: 8, padding: '10px 12px',
              opacity: c.resolved ? 0.55 : 1, background: 'var(--bg-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', background: 'var(--gold-grad)',
                  display: 'inline-grid', placeItems: 'center', color: '#1d1709', fontSize: 11, fontWeight: 700,
                }}>
                  {c.author[0]?.toUpperCase() ?? 'Y'}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.author}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{timeAgo(c.createdAt)}</span>
                <span style={{ flex: 1 }} />
                <button className="icon-btn small" title={c.resolved ? 'Re-open' : 'Resolve'}
                  onClick={() => updateComment(c.id, { resolved: !c.resolved })}>
                  {c.resolved ? <RotateCcw size={13} /> : <Check size={14} />}
                </button>
                <button className="icon-btn small" title="Delete" onClick={() => deleteComment(c.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.text}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--divider)', display: 'flex', gap: 8 }}>
          <input
            className="text-input"
            placeholder="Add a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button className="btn primary small" disabled={!draft.trim()} onClick={submit}><Send size={14} /></button>
        </div>
      </div>
    </>
  );
}
