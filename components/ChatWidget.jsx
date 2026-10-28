'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { mergeMemory, sanitizeUpdates, selectForRequest } from '@/lib/intelligence/memory.mjs';
import { loadLearn, loadMemory, saveLearn, saveMemory } from '@/lib/client/chatMemory';

const STORE_KEY = 'meridian.chat.v1';
const MAX_STORED = 40;

const SUGGESTIONS = {
  geopolitics: [
    'What are the top stories right now?',
    'Which conflicts are escalating?',
    'What should I watch this week?',
    'Explain the #1 story in simple terms',
  ],
  finance: [
    "What's moving markets today?",
    'Which stories could affect interest rates?',
    'Any big regulatory or earnings news?',
    'What are the biggest risks right now?',
  ],
  story: [
    'What happened here, in plain terms?',
    'Why does this matter?',
    'Who are the main parties and what do they want?',
    'What could happen next?',
  ],
};

function safeUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
}

/** Edition + story the reader is currently looking at. */
function readContext(pathname) {
  const story = /^\/story\/([\w-]+)/.exec(pathname || '');
  const params = new URLSearchParams(window.location.search);
  let edition = document.querySelector('[data-edition]:not(.chat-root)')?.getAttribute('data-edition');
  if (story) edition = params.get('edition') || edition;
  // The markets tab has no ranked articles of its own; use the finance wire.
  edition = edition === 'finance' || edition === 'markets' ? 'finance' : 'geopolitics';
  return { edition, storyId: story ? story[1] : null };
}

function loadStored() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_STORED) : [];
  } catch {
    return [];
  }
}

/** Inline formatting: **bold** and [n] citation markers. */
function renderInline(text, citations, keyBase) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\[(\d{1,2})\]/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(<strong key={`${keyBase}-${i++}`}>{m[1]}</strong>);
    } else {
      const c = citations.find((x) => x.n === Number(m[2]));
      const href = c && safeUrl(c.link);
      out.push(
        href ? (
          <a
            key={`${keyBase}-${i++}`}
            className="chat-cite"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={`${c.source}: ${c.title}`}
          >
            {m[2]}
          </a>
        ) : (
          <span key={`${keyBase}-${i++}`} className="chat-cite">
            {m[2]}
          </span>
        )
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function AnswerBody({ text, citations }) {
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push({ type: 'ul', items: bullets });
      bullets = [];
    }
  };
  for (const line of text.split('\n')) {
    const b = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (b) bullets.push(b[1]);
    else {
      flush();
      if (line.trim()) blocks.push({ type: 'p', text: line.trim() });
    }
  }
  flush();

  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul key={i}>
        {b.items.map((it, j) => (
          <li key={j}>{renderInline(it, citations, `${i}-${j}`)}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{renderInline(b.text, citations, String(i))}</p>
    )
  );
}

const THINK_STAGES = [
  'Searching today’s coverage',
  'Reading the most relevant articles',
  'Cross-checking sources',
  'Drafting your answer',
];

/** Live status while waiting: cycling stages, a moving wave, and a timer. */
function Thinking() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSecs((Date.now() - start) / 1000), 200);
    return () => clearInterval(id);
  }, []);
  const stage = Math.min(Math.floor(secs / 1.8), THINK_STAGES.length - 1);
  const slow = secs >= 10;
  return (
    <div className="chat-msg chat-bot chat-thinking" role="status">
      <span className="sr-only">The assistant is working on your answer</span>
      <div className="chat-think-row" aria-hidden="true">
        <span className="chat-wave">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="chat-think-text" key={slow ? 'slow' : stage}>
          {slow ? 'Taking longer than usual, still working' : THINK_STAGES[stage]}
          <span className="chat-ellipsis">...</span>
        </span>
        <span className="chat-think-time">{Math.floor(secs)}s</span>
      </div>
      <span className="chat-think-bar" aria-hidden="true" />
    </div>
  );
}

function Message({ msg }) {
  if (msg.role === 'user') {
    return <div className="chat-msg chat-user">{msg.text}</div>;
  }
  return (
    <div className={`chat-msg chat-bot${msg.error ? ' chat-error' : ''}`}>
      <AnswerBody text={msg.text} citations={msg.citations || []} />
      {msg.usedBackgroundKnowledge && (
        <p className="chat-note">Includes general background, not only today&apos;s reporting.</p>
      )}
      {msg.notice && <p className="chat-note">{msg.notice}</p>}
      {msg.provider === 'openrouter' && (
        <p className="chat-note">Answered by a backup model while the main one was unavailable.</p>
      )}
      {msg.learned && (msg.learned.added.length > 0 || msg.learned.dropped.length > 0) && (
        <p className="chat-learned">
          {msg.learned.added.length > 0 && <>Remembered: {msg.learned.added.join('; ')}. </>}
          {msg.learned.dropped.length > 0 && <>Forgot: {msg.learned.dropped.join('; ')}.</>}
        </p>
      )}
      {msg.citations?.length > 0 && (
        <ol className="chat-sources" aria-label="Sources">
          {msg.citations.map((c) => {
            const href = safeUrl(c.link);
            return (
              <li key={c.n} value={c.n}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    <b>{c.source}</b> — {c.title}
                  </a>
                ) : (
                  <span>
                    <b>{c.source}</b> — {c.title}
                  </span>
                )}
                {c.storyUrl && (
                  <a className="chat-story-link" href={c.storyUrl}>
                    Story page
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState({ edition: 'geopolitics', storyId: null });
  const [followUps, setFollowUps] = useState([]);
  const [memory, setMemory] = useState([]);
  const [learn, setLearn] = useState(true);
  const [view, setView] = useState('chat'); // 'chat' | 'memory'
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setMessages(loadStored());
    setMemory(loadMemory());
    setLearn(loadLearn());
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      /* storage unavailable — chat still works, just isn't kept across reloads */
    }
  }, [messages]);

  // Track which edition/story the reader is on while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const sync = () => {
      const next = readContext(pathname);
      setCtx((prev) =>
        prev.edition === next.edition && prev.storyId === next.storyId ? prev : next
      );
    };
    sync();
    const id = setInterval(sync, 1500);
    return () => clearInterval(id);
  }, [open, pathname]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, expanded]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const close = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };

  const send = useCallback(
    async (text) => {
      const q = text.trim();
      if (q.length < 2 || busy) return;
      const context = readContext(pathname);
      setCtx(context);
      const sentMemory = selectForRequest(memory);
      const history = messages
        .filter((m) => !m.error)
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      setMessages((prev) => [...prev, { role: 'user', text: q }]);
      setInput('');
      setFollowUps([]);
      setBusy(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: q,
            history,
            edition: context.edition,
            storyId: context.storyId,
            learn,
            memory: learn ? sentMemory : [],
          }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || 'Something went wrong. Try again.');
        }
        let learned = null;
        if (learn && data.memoryUpdates) {
          const updates = sanitizeUpdates(data.memoryUpdates, sentMemory.map((n) => n.id));
          const merged = mergeMemory(memory, updates);
          if (merged.added.length || merged.reinforced.length || merged.dropped.length) {
            setMemory(merged.memory);
            saveMemory(merged.memory);
          }
          learned = { added: merged.added, dropped: merged.dropped };
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.answer,
            citations: data.citations || [],
            notice: data.notice,
            usedBackgroundKnowledge: data.usedBackgroundKnowledge,
            provider: data.provider,
            learned,
          },
        ]);
        setFollowUps(Array.isArray(data.followUps) ? data.followUps : []);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: err.message || 'Request failed.', error: true },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, pathname, memory, learn]
  );

  const onSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  const onInputKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setFollowUps([]);
    setBusy(false);
  };

  const forget = (id) => {
    const next = memory.filter((n) => n.id !== id);
    setMemory(next);
    saveMemory(next);
  };
  const forgetAll = () => {
    setMemory([]);
    saveMemory([]);
  };
  const toggleLearn = () => {
    setLearn((v) => {
      saveLearn(!v);
      return !v;
    });
  };

  const suggestionKey = ctx.storyId ? 'story' : ctx.edition;
  const chips = messages.length === 0 ? SUGGESTIONS[suggestionKey] : followUps;
  const scopeLabel = ctx.storyId
    ? 'This story + current edition'
    : `${ctx.edition === 'finance' ? 'Finance' : 'Geopolitics'} edition`;

  return (
    <div className="chat-root" data-edition={ctx.edition}>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          className="chat-launcher"
          onClick={() => setOpen(true)}
          aria-label="Open news assistant"
          aria-haspopup="dialog"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 5h16v11H9l-5 4V5z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span>Ask the Brief</span>
        </button>
      )}

      {open && (
        <section
          className={`chat-panel${expanded ? ' expanded' : ''}`}
          role="dialog"
          aria-label="News assistant"
          onKeyDown={onKeyDown}
        >
          <header className="chat-head">
            <div>
              <h2>Ask the Brief</h2>
              <p>{scopeLabel}</p>
            </div>
            <div className="chat-head-actions">
              <button
                type="button"
                className={`chat-mem-btn${view === 'memory' ? ' on' : ''}`}
                onClick={() => setView((v) => (v === 'memory' ? 'chat' : 'memory'))}
                aria-label={`What the assistant remembers about you (${memory.length})`}
                aria-pressed={view === 'memory'}
                title="Memory"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
                {memory.length > 0 && <b>{memory.length}</b>}
              </button>
              {messages.length > 0 && view === 'chat' && (
                <button type="button" onClick={clear} aria-label="Clear conversation" title="Clear">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 7h14M10 7V5h4v2m-6 0 .7 12h6.6L16 7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="chat-expand"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? 'Shrink chat' : 'Expand chat'}
                aria-pressed={expanded}
                title={expanded ? 'Shrink' : 'Expand'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {expanded ? (
                    <path
                      d="M10 4v6H4m10-6v6h6M10 20v-6H4m10 6v-6h6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      d="M4 10V4h6m10 6V4h-6M4 14v6h6m10-6v6h-6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </button>
              <button type="button" onClick={close} aria-label="Minimise chat" title="Minimise">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          {view === 'memory' ? (
            <div className="chat-memory">
              <label className="chat-switch">
                <input type="checkbox" role="switch" checked={learn} onChange={toggleLearn} />
                <span aria-hidden="true" />
                <em>Learn from my chats</em>
              </label>
              <p className="chat-mem-help">
                Durable notes about your interests and preferences help tailor answers. They are
                stored only in this browser, fade when unused, and are dropped automatically.
                News facts and personal details are never kept.
              </p>
              {memory.length === 0 ? (
                <p className="chat-mem-empty">
                  {learn ? 'Nothing remembered yet. Notes appear as you chat.' : 'Learning is off.'}
                </p>
              ) : (
                <ul className="chat-mem-list">
                  {memory.map((n) => (
                    <li key={n.id}>
                      <span className="chat-mem-kind">{n.kind}</span>
                      <span className="chat-mem-text">{n.text}</span>
                      <button type="button" onClick={() => forget(n.id)} aria-label={`Forget: ${n.text}`}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="chat-mem-actions">
                {memory.length > 0 && (
                  <button type="button" onClick={forgetAll}>
                    Forget everything
                  </button>
                )}
                <button type="button" onClick={() => setView('chat')}>
                  Back to chat
                </button>
              </div>
            </div>
          ) : (
            <>
            <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-busy={busy}>
              {messages.length === 0 && (
                <div className="chat-empty">
                  <p>
                    Ask about the news on this page or anything it touches. Answers are drawn from the
                    ranked articles and cite their sources.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <Message key={i} msg={m} />
              ))}
              {busy && <Thinking />}
            </div>

            {chips.length > 0 && !busy && (
              <div className="chat-chips" aria-label="Suggested questions">
                {chips.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form className="chat-form" onSubmit={onSubmit}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Ask about the news…"
                aria-label="Your question"
                rows={1}
                maxLength={500}
              />
              <button type="submit" disabled={busy || input.trim().length < 2}>
                Send
              </button>
            </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
