// STUB — replaced by the Databases agent.
// Contract: export function DatabaseBlock({ block }: { block: Block }): JSX.Element
//   – renders the database identified by block.props.pageId inline in a page.
//   – block.props.linked === true means it is a linked view of an existing database.
import { useStore } from '../../lib/store';
import type { Block } from '../../lib/types';
import { DatabaseFullPage } from './DatabaseView';

export function DatabaseBlock({ block }: { block: Block }) {
  const page = useStore((s) => (block.props.pageId ? s.pages[block.props.pageId] : undefined));
  if (!page || page.deletedAt) {
    return <div contentEditable={false} style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Deleted database</div>;
  }
  return (
    <div contentEditable={false}>
      <DatabaseFullPage page={page} />
    </div>
  );
}
