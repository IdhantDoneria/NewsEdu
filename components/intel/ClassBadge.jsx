'use client';

const LABELS = {
  FACT: 'Fact',
  'PARTY CLAIM': 'Party claim',
  ANALYSIS: 'Analysis',
  SCENARIO: 'Scenario',
  UNCERTAINTY: 'Uncertainty',
};

const TITLES = {
  FACT: 'Directly supported by cited source reporting',
  'PARTY CLAIM': 'What an actor asserts — not independently verified',
  ANALYSIS: 'Reasoned interpretation, not a verified fact',
  SCENARIO: 'A possibility, not a prediction',
  UNCERTAINTY: 'Unknown or unconfirmed',
};

/** Small classification chip used across intelligence surfaces. */
export default function ClassBadge({ kind, uncertainty }) {
  const k = LABELS[kind] ? kind : 'ANALYSIS';
  return (
    <span className={`class-badge cb-${k.toLowerCase().replace(' ', '-')}`} title={TITLES[k]}>
      {LABELS[k]}
      {uncertainty ? ` · ${uncertainty.toLowerCase()} confidence` : ''}
    </span>
  );
}
