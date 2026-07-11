import { LayoutTemplate, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { openPage, setTemplatesOpen, useStore } from '../../lib/store';
import { TEMPLATES, type TemplateCategory, type TemplateDef } from '../../lib/templates';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';

type Rail = 'All' | TemplateCategory;
const RAIL: Rail[] = ['All', 'Work', 'Personal', 'Knowledge'];
const CHIP: Record<TemplateCategory, string> = {
  Work: 'pill-blue',
  Personal: 'pill-green',
  Knowledge: 'pill-purple',
};

export function TemplatesGallery() {
  const open = useStore((s) => s.templatesOpen);
  const [cat, setCat] = useState<Rail>('All');
  const [hover, setHover] = useState<string | null>(null);

  const items = useMemo(
    () => (cat === 'All' ? TEMPLATES : TEMPLATES.filter((t) => t.category === cat)),
    [cat],
  );

  if (!open) return null;
  const close = () => { setTemplatesOpen(false); setCat('All'); };

  const use = (t: TemplateDef) => {
    const id = t.create(null);
    setTemplatesOpen(false);
    setCat('All');
    openPage(id);
    toast('Template added');
  };

  return (
    <Modal onClose={close}>
      {/* left rail */}
      <div style={{
        width: 188, flexShrink: 0, background: 'var(--sidebar-bg)', padding: 10,
        display: 'flex', flexDirection: 'column', gap: 1, height: 'min(78vh, 660px)',
        borderRight: '1px solid var(--divider)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, fontWeight: 650, fontSize: 14,
          padding: '8px 10px 14px', color: 'var(--text)',
        }}>
          <LayoutTemplate size={15} style={{ color: 'var(--gold)' }} />
          Templates
        </div>
        {RAIL.map((c) => {
          const n = c === 'All' ? TEMPLATES.length : TEMPLATES.filter((t) => t.category === c).length;
          return (
            <button key={c} className={`menu-item ${cat === c ? 'hl' : ''}`} onClick={() => setCat(c)}>
              <span className="mi-label" style={{ fontWeight: cat === c ? 600 : 450 }}>{c}</span>
              <span className="mi-hint">{n}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ padding: '0 10px 6px', fontSize: 12, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
          Crafted starting points for work, life, and learning.
        </div>
      </div>

      {/* gallery */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontWeight: 640, fontSize: 15, flex: 1 }}>
            {cat === 'All' ? 'All templates' : cat}
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
              {items.length} {items.length === 1 ? 'template' : 'templates'}
            </span>
          </div>
          <button className="icon-btn" onClick={close}><X size={17} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {items.map((t) => {
              const lifted = hover === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => use(t)}
                  onMouseEnter={() => setHover(t.id)}
                  onMouseLeave={() => setHover((h) => (h === t.id ? null : h))}
                  style={{
                    textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'var(--text)',
                    background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${lifted ? 'var(--gold)' : 'var(--border)'}`,
                    padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8,
                    transform: lifted ? 'translateY(-2px)' : 'none',
                    boxShadow: lifted ? 'var(--shadow-card)' : 'none',
                    transition: 'transform 0.15s var(--ease), box-shadow 0.15s var(--ease), border-color 0.15s var(--ease)',
                  }}
                >
                  <span style={{ fontSize: 30, lineHeight: 1 }}>{t.icon}</span>
                  <span style={{ fontWeight: 620, fontSize: 14.5, marginTop: 4 }}>{t.name}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', flex: 1 }}>
                    {t.desc}
                  </span>
                  <span>
                    <span className={`chip ${CHIP[t.category]}`}>{t.category}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--divider)',
          fontSize: 12.5, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: 'var(--gold)' }}>✦</span>
          Templates create real pages — edit everything.
        </div>
      </div>
    </Modal>
  );
}
