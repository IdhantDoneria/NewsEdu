// STUB — replaced by the Templates agent.
// Contract: <TemplatesGallery /> mounted in App; renders a Modal when
// useStore(s => s.templatesOpen) is true; instantiates templates from lib/templates.
import { setTemplatesOpen, useStore } from '../../lib/store';
import { Modal } from '../ui/Modal';

export function TemplatesGallery() {
  const open = useStore((s) => s.templatesOpen);
  if (!open) return null;
  return (
    <Modal narrow onClose={() => setTemplatesOpen(false)}>
      <div style={{ padding: 24 }}>Template gallery loading…</div>
    </Modal>
  );
}
