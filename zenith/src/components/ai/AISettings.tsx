import { useState } from 'react';
import {
  aiModelLabel, DEFAULT_OPENAI_MODEL, GEMINI_KEY_URL, GEMINI_MODELS, testConnection,
} from '../../lib/ai';
import { updateSettings, useStore } from '../../lib/store';
import { Row } from '../settings/SettingsModal';
import './ai.css';

export function AISettingsSection() {
  const settings = useStore((s) => s.settings);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const provider = settings.aiProvider ?? 'gemini';

  const test = async () => {
    setTesting(true);
    setResult(null);
    setResult(await testConnection());
    setTesting(false);
  };

  return (
    <div>
      <Row title="Provider" desc="Use Google's free Gemini tier, or any OpenAI-compatible endpoint.">
        <div className="seg">
          <button className={provider === 'gemini' ? 'on' : ''} onClick={() => updateSettings({ aiProvider: 'gemini' })}>Gemini</button>
          <button className={provider === 'openai' ? 'on' : ''} onClick={() => updateSettings({ aiProvider: 'openai' })}>OpenAI-compatible</button>
        </div>
      </Row>

      {provider === 'gemini' ? (
        <>
          <Row title="API key" desc="Stored only in this browser.">
            <div style={{ display: 'flex', gap: 6, width: 280 }}>
              <input
                className="text-input" type={showKey ? 'text' : 'password'} placeholder="AIza…"
                value={settings.geminiKey ?? ''} onChange={(e) => updateSettings({ geminiKey: e.target.value })}
              />
              <button className="btn small" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
            </div>
          </Row>
          <Row title="Model">
            <select className="text-input" style={{ width: 200 }} value={settings.geminiModel ?? GEMINI_MODELS[0]} onChange={(e) => updateSettings({ geminiModel: e.target.value })}>
              {GEMINI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              {settings.geminiModel && !GEMINI_MODELS.includes(settings.geminiModel) && <option value={settings.geminiModel}>{settings.geminiModel}</option>}
            </select>
          </Row>
          <Row title="Custom model" desc="Override with any Gemini model id.">
            <input className="text-input" style={{ width: 200 }} placeholder="gemini-2.0-flash" value={settings.geminiModel ?? ''} onChange={(e) => updateSettings({ geminiModel: e.target.value })} />
          </Row>
          <div style={{ margin: '10px 0', fontSize: 13 }}>
            <a className="btn gold small" href={GEMINI_KEY_URL} target="_blank" rel="noreferrer">Get a free Gemini key ↗</a>
          </div>
        </>
      ) : (
        <>
          <Row title="Base URL" desc="Any OpenAI-compatible /v1 endpoint.">
            <input className="text-input" style={{ width: 240 }} placeholder="https://api.openai.com/v1" value={settings.openaiBase ?? ''} onChange={(e) => updateSettings({ openaiBase: e.target.value })} />
          </Row>
          <Row title="API key">
            <div style={{ display: 'flex', gap: 6, width: 280 }}>
              <input className="text-input" type={showKey ? 'text' : 'password'} placeholder="sk-…" value={settings.openaiKey ?? ''} onChange={(e) => updateSettings({ openaiKey: e.target.value })} />
              <button className="btn small" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
            </div>
          </Row>
          <Row title="Model">
            <input className="text-input" style={{ width: 200 }} placeholder={DEFAULT_OPENAI_MODEL} value={settings.openaiModel ?? ''} onChange={(e) => updateSettings({ openaiModel: e.target.value })} />
          </Row>
        </>
      )}

      <Row title="Test connection" desc={`Sends one tiny prompt to ${aiModelLabel()}.`}>
        <button className="btn small" disabled={testing} onClick={test}>{testing ? 'Testing…' : 'Test'}</button>
      </Row>
      {result && (
        <div style={{ fontSize: 13, color: result.ok ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
          {result.ok ? '✓ ' : '✗ '}{result.message}
        </div>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.6 }}>
        Your key never leaves this browser; requests go directly from your device to the provider.
        Zenith has no server in between.
      </p>
    </div>
  );
}
