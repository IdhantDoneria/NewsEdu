// STUB — replaced by the AI agent.
// Contract: <AIHost /> is mounted once in App. It subscribes to aiBus ('open')
// and renders the full AI assistant popover (actions, streaming, insert/replace).
import { useEffect, useState } from 'react';
import { aiBus, type AIRequest } from '../../lib/bus';
import { setSettingsOpen } from '../../lib/store';
import { Popover } from '../ui/Popover';

export function AIHost() {
  const [req, setReq] = useState<AIRequest | null>(null);
  useEffect(() => aiBus.on('open', setReq), []);
  if (!req) return null;
  return (
    <Popover anchor={req.anchor} onClose={() => setReq(null)} width={360}>
      <div style={{ padding: 14, fontSize: 14 }}>
        ✨ The AI assistant is initializing… add your free Gemini key in{' '}
        <a style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setReq(null); setSettingsOpen('ai'); }}>
          Settings → Zenith AI
        </a>.
      </div>
    </Popover>
  );
}
