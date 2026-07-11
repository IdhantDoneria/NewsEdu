import { getChildren, useStore } from '../../lib/store';
import { Block } from './Block';

export function BlockList({ pageId, parentId, depth = 0 }: { pageId: string; parentId: string | null; depth?: number }) {
  useStore((s) => s.pageTick[pageId]);
  const blocks = getChildren(pageId, parentId);
  let num = 0;
  return (
    <div className="block-list">
      {blocks.map((b) => {
        num = b.type === 'numbered' ? num + 1 : 0;
        return <Block key={b.id} block={b} listIndex={num || 1} depth={depth} />;
      })}
    </div>
  );
}
