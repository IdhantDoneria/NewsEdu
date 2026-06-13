import { Download, Upload, HardDrive, AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db } from '../../lib/db';
import {
  exportPageMarkdown, exportWorkspaceJSON, importMarkdown, importWorkspaceJSON,
  downloadFile, safeFileName,
} from '../../lib/export';
import { createPage, updateSettings, useStore } from '../../lib/store';
import { Row } from './SettingsModal';
import { toast } from '../ui/Toast';
import { fmtDate } from '../editor/editorUtils';

export function DataSettingsSection() {
  const settings = useStore((s) => s.settings);
  const pages = useStore((s) => s.pages);
  const jsonRef = useRef<HTMLInputElement>(null);
  const mdRef = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [eraseText, setEraseText] = useState('');

  const livePages = Object.values(pages).filter((p) => !p.deletedAt);
  const blockCount = useStore((s) => Object.keys(s.blocks).length);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
  }, []);

  const exportJSON = async () => {
    downloadFile(`zenith-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportWorkspaceJSON(), 'application/json');
    updateSettings({ lastBackupAt: Date.now() });
    toast('Workspace exported');
  };

  const exportAllMd = () => {
    const docs = Object.values(pages).filter((p) => !p.deletedAt && !p.databaseId).sort((a, b) => a.createdAt - b.createdAt);
    const md = docs.map((p) => exportPageMarkdown(p.id)).join('\n\n---\n\n');
    downloadFile('zenith-pages.md', md, 'text/markdown');
    toast(`Exported ${docs.length} pages`);
  };

  const importJSON = async (file: File) => {
    const text = await file.text();
    const replace = confirm('Import as REPLACE? OK = replace everything, Cancel = merge into current workspace.');
    try {
      await importWorkspaceJSON(text, replace ? 'replace' : 'merge');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const importMd = async (files: FileList) => {
    const parent = createPage({ title: 'Imports', icon: '📥' });
    let n = 0;
    for (const f of Array.from(files)) {
      const text = await f.text();
      importMarkdown(f.name, text, parent);
      n++;
    }
    toast(`Imported ${n} file${n > 1 ? 's' : ''} into “Imports”`);
  };

  const erase = async () => {
    if (eraseText !== 'ERASE') return;
    await db.delete();
    location.reload();
  };

  return (
    <div>
      <div className="menu-title" style={{ paddingLeft: 0 }}>Backup</div>
      <Row title="Export workspace" desc={settings.lastBackupAt ? `Last backup ${fmtDate(settings.lastBackupAt, true)}` : 'A complete .json snapshot you can re-import anywhere.'}>
        <button className="btn small" onClick={exportJSON}><Download size={14} /> Export .json</button>
      </Row>
      <Row title="Export all pages as Markdown" desc="Every page concatenated into one .md file.">
        <button className="btn small" onClick={exportAllMd}><Download size={14} /> Export .md</button>
      </Row>

      <div className="menu-title" style={{ paddingLeft: 0, marginTop: 18 }}>Import</div>
      <Row title="Import a Zenith backup" desc="Merge or replace from a .json export.">
        <button className="btn small" onClick={() => jsonRef.current?.click()}><Upload size={14} /> Choose .json</button>
        <input ref={jsonRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ''; }} />
      </Row>
      <Row title="Import Markdown files" desc="Each file becomes a page under “Imports”.">
        <button className="btn small" onClick={() => mdRef.current?.click()}><Upload size={14} /> Choose .md</button>
        <input ref={mdRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden onChange={(e) => { if (e.target.files?.length) importMd(e.target.files); e.target.value = ''; }} />
      </Row>

      <div className="menu-title" style={{ paddingLeft: 0, marginTop: 18 }}>Storage</div>
      <Row title="On this device" desc={`${livePages.length} pages · ${blockCount} blocks`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <HardDrive size={14} />
          {storage ? `${fmtBytes(storage.usage)} used` : '—'}
        </span>
      </Row>
      {storage && storage.quota > 0 && (
        <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', marginTop: 2 }}>
          <div style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%`, height: '100%', background: 'var(--gold-grad)' }} />
        </div>
      )}

      <div className="menu-title" style={{ paddingLeft: 0, marginTop: 18, color: 'var(--red)' }}>Danger zone</div>
      <Row title="Erase local workspace" desc="Permanently deletes everything in this browser. Cloud copies (if any) are untouched.">
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <input className="text-input" style={{ width: 110 }} placeholder="type ERASE" value={eraseText} onChange={(e) => setEraseText(e.target.value)} />
          <button className="btn small danger" disabled={eraseText !== 'ERASE'} onClick={erase}><AlertTriangle size={14} /> Erase</button>
        </span>
      </Row>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
