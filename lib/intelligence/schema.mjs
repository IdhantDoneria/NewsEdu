/**
 * Schema validation for AI-generated intelligence objects.
 *
 * Every structured model output passes through here before persistence or
 * rendering. The validator is strict about shape and enums but forgiving
 * about extra fields (they're stripped). Citations that don't reference a
 * real article in the cluster are removed; claims left with no surviving
 * citation are downgraded from FACT to ANALYSIS so the UI never presents
 * ungrounded text as fact.
 */

export const CLASSIFICATIONS = ['FACT', 'PARTY CLAIM', 'ANALYSIS', 'SCENARIO', 'UNCERTAINTY'];
export const UNCERTAINTY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

function str(v, max = 2000) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function arr(v, max) {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

function classification(v, fallback = 'ANALYSIS') {
  const up = String(v || '').toUpperCase().replace(/_/g, ' ').trim();
  return CLASSIFICATIONS.includes(up) ? up : fallback;
}

function citations(v, validIds) {
  return arr(v, 6)
    .map((c) => String(c))
    .filter((c) => validIds.has(c));
}

/** A classified statement with provenance. */
function statement(v, validIds, fallbackClass = 'ANALYSIS') {
  const text = str(v?.text ?? v, 1200);
  if (!text) return null;
  const cites = citations(v?.citations, validIds);
  let cls = classification(v?.classification, fallbackClass);
  // Facts must be grounded; ungrounded "facts" are demoted.
  if (cls === 'FACT' && cites.length === 0) cls = 'ANALYSIS';
  return { text, classification: cls, citations: cites };
}

/**
 * Validate and sanitise a full intelligence object.
 * Returns the clean object, or null if the payload is unusable
 * (no factual core at all).
 */
export function validateIntel(raw, articleIds) {
  if (!raw || typeof raw !== 'object') return null;
  const validIds = new Set((articleIds || []).map(String));

  const whatHappened = statement(raw.whatHappened, validIds, 'FACT');
  if (!whatHappened || whatHappened.text.length < 20) return null;

  const out = {
    whatHappened,
    whyItMatters: arr(raw.whyItMatters, 4)
      .map((s) => statement(s, validIds, 'ANALYSIS'))
      .filter(Boolean),
    background: arr(raw.background, 4)
      .map((s) => statement(s, validIds, 'FACT'))
      .filter(Boolean),
    keyActors: arr(raw.keyActors, 8)
      .map((a) => ({
        name: str(a?.name, 120),
        kind: str(a?.kind, 40) || 'actor',
        role: str(a?.role, 300),
      }))
      .filter((a) => a.name),
    stakeholders: arr(raw.stakeholders, 6)
      .map((s) => ({
        actor: str(s?.actor, 120),
        wants: str(s?.wants, 400),
        publiclyClaims: str(s?.publiclyClaims, 400),
        opposes: str(s?.opposes, 400),
        mayCompromiseOn: str(s?.mayCompromiseOn, 400),
        // "wants/opposes/compromise" are inferred strategy → ANALYSIS;
        // publiclyClaims is by definition a PARTY CLAIM. The UI renders both
        // labels; this field records the inferred-position classification.
        classification: 'ANALYSIS',
      }))
      .filter((s) => s.actor && (s.wants || s.publiclyClaims)),
    disagreements: arr(raw.disagreements, 5)
      .map((s) => statement(s, validIds, 'ANALYSIS'))
      .filter(Boolean),
    keyNumbers: arr(raw.keyNumbers, 8)
      .map((n) => ({
        value: str(n?.value, 60),
        label: str(n?.label, 200),
        citations: citations(n?.citations, validIds),
      }))
      .filter((n) => n.value && n.label),
    timeline: arr(raw.timeline, 12)
      .map((t) => ({
        at: Number.isFinite(t?.at) ? t.at : Date.parse(t?.at) || null,
        text: str(t?.text, 300),
        citations: citations(t?.citations, validIds),
      }))
      .filter((t) => t.text)
      .sort((a, b) => (a.at || 0) - (b.at || 0)),
    scenarios: arr(raw.scenarios, 4)
      .map((s) => ({
        description: str(s?.description, 500),
        signals: arr(s?.signals, 4).map((x) => str(x, 300)).filter(Boolean),
        counterSignals: arr(s?.counterSignals, 4).map((x) => str(x, 300)).filter(Boolean),
        uncertainty: UNCERTAINTY_LEVELS.includes(String(s?.uncertainty || '').toUpperCase())
          ? String(s.uncertainty).toUpperCase()
          : 'HIGH',
        classification: 'SCENARIO',
      }))
      .filter((s) => s.description),
    causalChain: arr(raw.causalChain, 8)
      .map((e) => ({
        from: str(e?.from, 200),
        to: str(e?.to, 200),
        type: str(e?.type, 60) || 'leads-to',
        explanation: str(e?.explanation, 400),
        confidence: UNCERTAINTY_LEVELS.includes(String(e?.confidence || '').toUpperCase())
          ? String(e.confidence).toUpperCase()
          : 'MEDIUM',
        citations: citations(e?.citations, validIds),
      }))
      .filter((e) => e.from && e.to),
    watchNext: arr(raw.watchNext, 4)
      .map((s) => statement(s, validIds, 'ANALYSIS'))
      .filter(Boolean),
  };

  return out;
}
