// Zenith AI assistant popover: action menu → streaming → result actions.
import {
  ArrowLeft, Check, ClipboardCopy, CornerDownLeft, Languages, ListChecks,
  ListTree, PenLine, RotateCcw, Send, Smile, Sparkles, SpellCheck2, StopCircle,
  Trash2, Wand2, X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { hasAIKey, streamCompletion, GEMINI_KEY_URL } from '../../lib/ai';
import { aiBus, type AIRequest } from '../../lib/bus';
import { setSettingsOpen } from '../../lib/store';
import { Popover } from '../ui/Popover';
import { toast } from '../ui/Toast';
import {
  buildPrompt, insertBlocksBelow, replaceBlockWith, replaceSelectionIn,
} from './aiUtil';

type Stage = 'menu' | 'submenu' | 'streaming' | 'result';

interface Action { id: string; label: string; icon: ReactNode; sub?: Array<{ id: string; label: string }> }

const TONES = ['Professional', 'Casual', 'Confident', 'Friendly'];
const LANGS = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'];

const ICON = (C: any) => <C size={15} />;

const SELECTION_ACTIONS: Action[] = [
  { id: 'improve', label: 'Improve writing', icon: ICON(Wand2) },
  { id: 'fix', label: 'Fix spelling & grammar', icon: ICON(SpellCheck2) },
  { id: 'shorter', label: 'Make shorter', icon: ICON(PenLine) },
  { id: 'longer', label: 'Make longer', icon: ICON(PenLine) },
  { id: 'summarize', label: 'Summarize', icon: ICON(ListTree) },
  { id: 'tone', label: 'Change tone', icon: ICON(Smile), sub: TONES.map((t) => ({ id: `tone:${t}`, label: t })) },
  { id: 'translate', label: 'Translate', icon: ICON(Languages), sub: LANGS.map((l) => ({ id: `translate:${l}`, label: l })) },
  { id: 'explain', label: 'Explain this', icon: ICON(Sparkles) },
];

const PAGE_ACTIONS: Action[] = [
  { id: 'continue', label: 'Continue writing', icon: ICON(PenLine) },
  { id: 'summarize-page', label: 'Summarize page', icon: ICON(ListTree) },
  { id: 'brainstorm', label: 'Brainstorm ideas', icon: ICON(Sparkles) },
  { id: 'outline', label: 'Create an outline', icon: ICON(ListTree) },
  { id: 'actions', label: 'Find action items', icon: ICON(ListChecks) },
];

export function AIHost() {
  const [req, setReq] = useState<AIRequest | null>(null);
  useEffect(() => aiBus.on('open', (r) => setReq(r)), []);
  useEffect(() => aiBus.on('close', () => setReq(null)), []);
  if (!req) return null;
  return <AIPanel key={req.blockId ?? 'page'} req={req} onClose={() => setReq(null)} />;
}

function AIPanel({ req, onClose }: { req: AIRequest; onClose: () => void }) {
  const hasSelection = !!req.selection?.trim();
  const actions = hasSelection ? SELECTION_ACTIONS : PAGE_ACTIONS;
  const [stage, setStage] = useState<Stage>('menu');
  const [sub, setSub] = useState<Action | null>(null);
  const [custom, setCustom] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ id: string; custom: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const noKey = useMemo(() => !hasAIKey(), []);

  const run = async (actionId: string, customText = '') => {
    setStage('streaming');
    setText('');
    setError(null);
    setLastAction({ id: actionId, custom: customText });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { system, prompt } = buildPrompt(actionId, req, customText);
    try {
      const out = await streamCompletion({ system, prompt, signal: ctrl.signal, onToken: (full) => setText(full) });
      setText(out);
      setStage('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStage('result');
    }
  };

  const stop = () => { abortRef.current?.abort(); setStage('result'); };

  const doInsert = () => {
    const n = insertBlocksBelow(req.pageId, req.blockId, text);
    toast(n ? `Inserted ${n} block${n > 1 ? 's' : ''}` : 'Nothing to insert');
    onClose();
  };
  const doReplaceSelection = () => {
    const ok = replaceSelectionIn(req.pageId, req.blockId, req.selection ?? '', text);
    if (!ok) { insertBlocksBelow(req.pageId, req.blockId, text); toast('Inserted below'); }
    else toast('Replaced selection');
    onClose();
  };
  const doReplaceBlock = () => {
    if (req.blockId) replaceBlockWith(req.pageId, req.blockId, text);
    onClose();
  };
  const copy = () => { navigator.clipboard.writeText(text); toast('Copied to clipboard'); };

  // ── no-key zero state ──
  if (noKey) {
    return (
      <Popover anchor={req.anchor} onClose={onClose} width={360}>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 650, fontSize: 15 }}>
            <Sparkles size={16} style={{ color: 'var(--gold)' }} /> Zenith AI
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '10px 0 14px' }}>
            Bring your own <b>free</b> key — a Google Gemini key takes about 30 seconds and costs nothing.
            It is stored only in this browser.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a className="btn gold" href={GEMINI_KEY_URL} target="_blank" rel="noreferrer" style={{ justifyContent: 'center' }}>
              Create a free Gemini key ↗
            </a>
            <button className="btn" onClick={() => { onClose(); setSettingsOpen('ai'); }}>Open AI settings</button>
          </div>
        </div>
      </Popover>
    );
  }

  return (
    <Popover anchor={req.anchor} onClose={onClose} width={420}>
      {(stage === 'menu' || stage === 'submenu') && (
        <div>
          <div className="ai-head"><Sparkles size={15} style={{ color: 'var(--gold)' }} /> Zenith AI</div>
          {stage === 'menu' ? (
            <div className="menu">
              <div style={{ padding: '4px 8px 8px' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="text-input" placeholder={hasSelection ? 'Tell AI what to do with the selection…' : 'Ask AI to write anything…'}
                    autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) run('custom', custom.trim()); e.stopPropagation(); }}
                  />
                  <button className="btn gold small" disabled={!custom.trim()} onClick={() => run('custom', custom.trim())}><Send size={14} /></button>
                </div>
              </div>
              <div className="menu-title">{hasSelection ? 'Edit selection' : 'Generate'}</div>
              {actions.map((a) => (
                <button key={a.id} className="menu-item" onClick={() => a.sub ? (setSub(a), setStage('submenu')) : run(a.id)}>
                  <span className="mi-icon">{a.icon}</span>
                  <span className="mi-label">{a.label}</span>
                  {a.sub && <span className="mi-hint">›</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="menu">
              <button className="menu-item" onClick={() => setStage('menu')}>
                <span className="mi-icon"><ArrowLeft size={14} /></span><span className="mi-label">{sub?.label}</span>
              </button>
              <div className="menu-sep" />
              {sub?.sub?.map((s) => (
                <button key={s.id} className="menu-item" onClick={() => run(s.id)}>
                  <span className="mi-icon" style={{ width: 20 }} />
                  <span className="mi-label">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === 'streaming' && (
        <div style={{ padding: 14 }}>
          <div className="ai-head" style={{ padding: 0, marginBottom: 10 }}>
            <Sparkles size={15} style={{ color: 'var(--gold)' }} className="ai-pulse" /> Zenith AI is writing…
          </div>
          <div className="ai-output">{text || <span style={{ color: 'var(--text-tertiary)' }}>Thinking…</span>}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn small" onClick={stop}><StopCircle size={14} /> Stop</button>
          </div>
        </div>
      )}

      {stage === 'result' && (
        <div style={{ padding: 14 }}>
          <div className="ai-head" style={{ padding: 0, marginBottom: 10 }}>
            <Sparkles size={15} style={{ color: 'var(--gold)' }} /> Zenith AI
          </div>
          {error ? (
            <div style={{ color: 'var(--red)', fontSize: 13.5, lineHeight: 1.5 }}>{error}</div>
          ) : (
            <div className="ai-output">{text}</div>
          )}
          <div className="ai-actions">
            {!error && (
              <>
                {req.selection
                  ? <button className="btn gold small" onClick={doReplaceSelection}><Check size={14} /> Replace selection</button>
                  : <button className="btn gold small" onClick={doInsert}><CornerDownLeft size={14} /> Insert below</button>}
                {req.selection
                  ? <button className="btn small" onClick={doInsert}>Insert below</button>
                  : req.blockId && <button className="btn small" onClick={doReplaceBlock}>Replace block</button>}
                <button className="btn small" onClick={copy}><ClipboardCopy size={14} /> Copy</button>
              </>
            )}
            <button className="btn small" onClick={() => lastAction && run(lastAction.id, lastAction.custom)}><RotateCcw size={14} /> Try again</button>
            <button className="btn small" onClick={onClose}><Trash2 size={14} /> Discard</button>
          </div>
        </div>
      )}
    </Popover>
  );
}

void X;
