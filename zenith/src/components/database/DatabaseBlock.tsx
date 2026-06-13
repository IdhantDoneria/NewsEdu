import { ArrowUpRight } from 'lucide-react';
import { openPage, useStore } from '../../lib/store';
import type { Block } from '../../lib/types';
import { DatabaseFullPage } from './DatabaseView';

export function DatabaseBlock({ block }: { block: Block }) {
  const page = useStore((s) => (block.props.pageId ? s.pages[block.props.pageId] : undefined));
  if (!page || page.deletedAt || page.type !== 'database') {
    return (
      <div contentEditable={false} style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '6px 0' }}>
        Database not found — it may have been deleted.
      </div>
    );
  }
  return (
    <div contentEditable={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{page.icon ? `${page.icon} ` : ''}{page.title || 'Untitled database'}</span>
        {block.props.linked && (
          <span className="db-linked-chip" onClick={() => openPage(page.id)} title="Open source database">
            <ArrowUpRight size={12} /> linked
          </span>
        )}
      </div>
      <DatabaseFullPage page={page} />
    </div>
  );
}
