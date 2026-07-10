'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import PageChrome from './intel/PageChrome';
import ClassBadge from './intel/ClassBadge';
import {
  loadProfile,
  recallPayload,
  recordRecallAttempt,
} from '@/lib/client/userState';

const VERDICT_LABEL = {
  correct: 'Correct',
  partial: 'Partially correct',
  incorrect: 'Not quite',
};

function KnowledgeMap({ chains }) {
  if (!chains || chains.length === 0) {
    return (
      <p className="meta">
        No causal connections yet — they appear as your read stories accumulate analyzed
        relationships.
      </p>
    );
  }
  return (
    <div className="kmap">
      {chains.map((chain, i) => (
        <div className="kmap-chain" key={i}>
          <div className="kmap-story">
            <Link href={`/story/${chain.clusterId}`}>{chain.storyTitle}</Link>
          </div>
          {chain.edges.map((e, j) => (
            <div className="kmap-edge" key={j}>
              <div className="kmap-node">{e.from}</div>
              <div className="kmap-arrow" aria-hidden="true">
                <span className="kmap-type">{e.type}</span>
                <span className="kmap-line">↓</span>
              </div>
              <div className="kmap-node to">
                {e.to}{' '}
                <ClassBadge
                  kind={e.grounded ? 'ANALYSIS' : 'SCENARIO'}
                  uncertainty={e.confidence}
                />
              </div>
              {e.explanation && <p className="kmap-expl">{e.explanation}</p>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function HistorySummary({ recall }) {
  const concepts = Object.entries(recall.concepts || {});
  if (recall.attempts.length === 0) return null;
  const correct = recall.attempts.filter((a) => a.verdict === 'correct').length;
  return (
    <div className="rail-block">
      <h3>Your Knowledge History</h3>
      <p className="meta">
        {recall.attempts.length} answers · {correct} fully correct
      </p>
      {concepts.length > 0 && (
        <ul className="concept-list">
          {concepts
            .sort((a, b) => b[1].lastAt - a[1].lastAt)
            .slice(0, 8)
            .map(([name, c]) => (
              <li key={name}>
                <b>{name}</b>
                <span className="meta">
                  {' '}
                  {c.correct}/{c.attempts} correct
                  {c.attempts >= 2 && c.correct === 0 && ' · worth revisiting'}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export default function Recall() {
  const [state, setState] = useState('loading'); // loading | empty | quiz | error
  const [questions, setQuestions] = useState([]);
  const [kmap, setKmap] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [recallHistory, setRecallHistory] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = loadProfile();
      setRecallHistory(profile.recall);
      const payload = recallPayload();
      if (payload.history.length === 0) {
        setState('empty');
        return;
      }
      try {
        const res = await fetch('/api/recall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (cancelled) return;
        setKmap(json.knowledgeMap || []);
        if (!json.questions || json.questions.length === 0) {
          setState(json.resolvedStories > 0 ? 'thin' : 'empty');
        } else {
          setQuestions(json.questions);
          setState('quiz');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = questions[idx];

  const submit = useCallback(
    async (e) => {
      e?.preventDefault();
      if (!q || evaluating) return;
      setEvaluating(true);
      try {
        const res = await fetch('/api/recall/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q.question,
            expectedAnswer: q.expectedAnswer,
            userAnswer: answer,
          }),
        });
        const json = await res.json();
        setEvaluation(json);
        const p = recordRecallAttempt({
          question: q.question,
          concept: q.concept,
          verdict: json.verdict,
          clusterId: q.clusterId,
        });
        setRecallHistory(p.recall);
      } catch {
        setEvaluation({
          verdict: 'partial',
          explanation: 'Evaluation is unreachable right now — compare your answer with the expected reasoning below.',
          correctAnswer: q.expectedAnswer,
        });
      } finally {
        setEvaluating(false);
      }
    },
    [q, answer, evaluating]
  );

  const next = useCallback(() => {
    setIdx((i) => i + 1);
    setAnswer('');
    setEvaluation(null);
  }, []);

  const done = state === 'quiz' && idx >= questions.length;
  const progress = useMemo(
    () => (questions.length ? `${Math.min(idx + 1, questions.length)} of ${questions.length}` : ''),
    [idx, questions.length]
  );

  return (
    <PageChrome kicker="Weekly Recall" title="Keep What You Learned">
      <div className="recall-grid">
        <div className="recall-main">
          {state === 'loading' && (
            <div className="state-box">
              <div className="press" />
              Building recall questions from what you actually read…
            </div>
          )}

          {state === 'error' && (
            <div className="state-box">The recall engine is unreachable. Reload to retry.</div>
          )}

          {state === 'thin' && (
            <div className="state-box">
              Your recent stories didn’t yield understanding-level questions yet — this usually
              means their coverage was too thin to analyze. Read a couple more{' '}
              <Link href="/">intelligence pages</Link> and try again.
            </div>
          )}

          {state === 'empty' && (
            <div className="state-box">
              Nothing to recall yet. Read a few{' '}
              <Link href="/">story intelligence pages</Link> or your{' '}
              <Link href="/briefing">daily briefing</Link> this week — questions are generated
              from stories you meaningfully engaged with. Reading history stays in this browser.
            </div>
          )}

          {state === 'quiz' && !done && q && (
            <div className="quiz-card">
              <div className="quiz-head">
                <span className="meta">Question {progress}</span>
                <span className="chip concept-chip">{q.concept}</span>
              </div>
              <h2 className="quiz-question">{q.question}</h2>

              {!evaluation ? (
                <form onSubmit={submit}>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={4}
                    placeholder="Answer in your own words — reasoning counts more than exact wording."
                    aria-label="Your answer"
                  />
                  <div className="quiz-actions">
                    <button type="submit" className="follow-btn" disabled={evaluating || answer.trim().length < 2}>
                      {evaluating ? 'Evaluating…' : 'Check my answer'}
                    </button>
                    <button type="button" className="chip" onClick={next}>
                      Skip
                    </button>
                  </div>
                </form>
              ) : (
                <div className={`evaluation verdict-${evaluation.verdict}`}>
                  <h3>{VERDICT_LABEL[evaluation.verdict] || 'Evaluated'}</h3>
                  <p>{evaluation.explanation}</p>
                  <div className="expected-answer">
                    <h4>The full reasoning</h4>
                    <p>{evaluation.correctAnswer}</p>
                  </div>
                  <div className="quiz-actions">
                    <button className="follow-btn" onClick={next}>
                      {idx + 1 < questions.length ? 'Next question' : 'Finish'}
                    </button>
                    <Link className="chip" href={`/story/${q.clusterId}`}>
                      Reopen the story
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="state-box">
              That’s this week’s recall — finite by design. Come back after more reading, or
              explore the knowledge connections beside.
            </div>
          )}
        </div>

        <aside className="story-rail">
          {recallHistory && <HistorySummary recall={recallHistory} />}
          <div className="rail-block">
            <h3>Knowledge Connections</h3>
            <p className="meta">Causal chains across the stories you consumed.</p>
            <KnowledgeMap chains={kmap} />
          </div>
        </aside>
      </div>
    </PageChrome>
  );
}
