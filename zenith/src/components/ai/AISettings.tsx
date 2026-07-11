import { useEffect, useState } from 'react';
import { aiModelLabel, DEFAULT_GEMINI_MODEL, GEMINI_MODELS, testConnection } from '../../lib/ai';
import { updateSettings, useStore } from '../../lib/store';
import { Row } from '../settings/SettingsModal';
import './ai.css';

export function AISettingsSection() {
  const settings = useStore((s) => s.settings);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const test = async () => {
    setTesting(true);
    setResult(null);
    setResult(await testConnection());
    setTesting(false);
  };

  // check status once when the tab is opened
  useEffect(() => { void test(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Row title="Status" desc={testing ? 'Checking…' : (result?.message ?? 'Not checked yet.')}>
        <span style={{ fontSize: 13, fontWeight: 600, color: testing ? 'var(--text-tertiary)' : result?.ok ? 'var(--green)' : result ? 'var(--red)' : 'var(--text-tertiary)' }}>
          {testing ? 'Checking…' : result?.ok ? '● Connected' : result ? '● Unavailable' : '—'}
        </span>
      </Row>
      <Row title="Model" desc="Which Gemini model Zenith AI uses for your requests.">
        <select
          className="text-input" style={{ width: 200 }}
          value={settings.aiModel ?? DEFAULT_GEMINI_MODEL}
          onChange={(e) => updateSettings({ aiModel: e.target.value })}
        >
          {GEMINI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Row>
      <Row title="Test connection" desc={`Sends one tiny prompt to ${aiModelLabel()}.`}>
        <button className="btn small" disabled={testing} onClick={test}>{testing ? 'Testing…' : 'Test'}</button>
      </Row>
      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.6 }}>
        Zenith AI is powered by the workspace's own API key, configured once by whoever runs this
        deployment. There's nothing to set up here — just select text or press <code>/ai</code>{' '}
        anywhere in a page.
      </p>
    </div>
  );
}
