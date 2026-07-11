import { ArrowUpRight, FileText } from 'lucide-react';
import { openPage, useStore } from '../../lib/store';
import type { Block as BlockDoc } from '../../lib/types';

export function PageChipBlock({ block }: { block: BlockDoc }) {
  const page = useStore((s) => (block.props.pageId ? s.pages[block.props.pageId] : undefined));
  if (!page || page.deletedAt) {
    return (
      <div className="page-chip" contentEditable={false} style={{ color: 'var(--text-tertiary)' }}>
        <FileText size={16} /> <span style={{ fontStyle: 'italic' }}>Deleted page</span>
      </div>
    );
  }
  return (
    <div className="page-chip" contentEditable={false} onClick={() => openPage(page.id)}>
      <span className="pc-icon">{page.icon ?? <FileText size={16} style={{ verticalAlign: -3 }} />}</span>
      <span className="pc-title">{page.title || 'Untitled'}</span>
      {block.type === 'linkPage' && <ArrowUpRight size={14} style={{ color: 'var(--text-tertiary)' }} />}
    </div>
  );
}
