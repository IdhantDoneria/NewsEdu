import { X } from 'lucide-react';
import { setShortcutsOpen, useStore } from '../../lib/store';
import { Modal } from '../ui/Modal';

const GROUPS: Array<{ name: string; items: Array<[string, string]> }> = [
  {
    name: 'Workspace',
    items: [
      ['⌘ K', 'Search & jump anywhere'],
      ['⌘ \\', 'Toggle sidebar'],
      ['⌘ ⇧ L', 'Toggle light / dark'],
      ['⌘ /', 'This shortcut panel'],
    ],
  },
  {
    name: 'Editing',
    items: [
      ['/', 'Open the block menu'],
      ['⌘ Z / ⌘ ⇧ Z', 'Undo / redo'],
      ['⌘ D', 'Duplicate block'],
      ['⌘ ⇧ ↑ / ↓', 'Move block up / down'],
      ['Tab / ⇧ Tab', 'Indent / outdent block'],
      ['⇧ Enter', 'Line break inside a block'],
      ['Drag right edge', 'Create columns'],
    ],
  },
  {
    name: 'Formatting',
    items: [
      ['⌘ B / I / U', 'Bold / italic / underline'],
      ['⌘ ⇧ S', 'Strikethrough'],
      ['⌘ E', 'Inline code'],
      ['⌘ K (selection)', 'Add link'],
      ['**text** *text*', 'Bold / italic as you type'],
      ['`code` ~~strike~~', 'Code / strike as you type'],
    ],
  },
  {
    name: 'Markdown starters',
    items: [
      ['# ## ###', 'Headings'],
      ['- or *', 'Bulleted list'],
      ['1.', 'Numbered list'],
      ['[]', 'To-do'],
      ['>', 'Toggle'],
      ['``` and ---', 'Code block / divider'],
    ],
  },
];

export function ShortcutsHelp() {
  const open = useStore((s) => s.shortcutsOpen);
  if (!open) return null;
  return (
    <Modal narrow onClose={() => setShortcutsOpen(false)}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ fontWeight: 650, fontSize: 15.5, flex: 1 }}>⌨️ Keyboard shortcuts</div>
        <button className="icon-btn" onClick={() => setShortcutsOpen(false)}><X size={17} /></button>
      </div>
      <div style={{ overflowY: 'auto', padding: '8px 18px 18px', maxHeight: 480 }}>
        {GROUPS.map((g) => (
          <div key={g.name}>
            <div className="menu-title" style={{ paddingLeft: 0 }}>{g.name}</div>
            {g.items.map(([keys, desc]) => (
              <div key={keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 13.5 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
                <span className="kbd">{keys}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
