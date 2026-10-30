/**
 * Replay labelled change cards (tests/fixtures/labels/change-cards.json)
 * through a detectChanges implementation and report precision/recall.
 */
import fs from 'node:fs';

export const CARD_SET = JSON.parse(
  fs.readFileSync(new URL('../fixtures/labels/change-cards.json', import.meta.url), 'utf8')
);

const HOUR = 36e5;

export function buildCase(card, now = 1793300000000) {
  const seen = {
    id: `${card.id}-seen`,
    title: card.seen.title,
    summary: '',
    link: `https://example.com/${card.id}-seen`,
    sourceName: 'BBC World',
    publishedAt: now - card.seen.hoursAgo * HOUR,
  };
  const neu = {
    id: `${card.id}-new`,
    title: card.new.title,
    summary: card.new.summary || '',
    link: `https://example.com/${card.id}-new`,
    sourceName: 'Reuters',
    publishedAt: now - card.new.hoursAgo * HOUR,
  };
  const firstSeen = new Map();
  if (card.new.firstSeenHoursAgo != null) firstSeen.set(neu.id, now - card.new.firstSeenHoursAgo * HOUR);
  const cluster = {
    id: card.id,
    title: seen.title,
    edition: 'geopolitics',
    articles: [seen, neu],
    articleIds: [seen.id, neu.id],
    latestAt: Math.max(seen.publishedAt, neu.publishedAt),
  };
  const snapshot = { articleIds: [seen.id], lastSeenAt: now - CARD_SET.lastSeenHoursAgo * HOUR };
  return { cluster, snapshot, firstSeen };
}

/** detect(cluster, snapshot, { firstSeen }) -> { changes } */
export function evaluateCards(detect, cards = CARD_SET.cards) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const falsePositives = [];
  const falseNegatives = [];
  for (const card of cards) {
    const { cluster, snapshot, firstSeen } = buildCase(card);
    const emitted = detect(cluster, snapshot, { firstSeen }).changes.length > 0;
    if (emitted && card.material) tp++;
    else if (emitted) {
      fp++;
      falsePositives.push(card.new.title);
    } else if (card.material) {
      fn++;
      falseNegatives.push(card.new.title);
    } else tn++;
  }
  return {
    n: cards.length,
    tp,
    fp,
    fn,
    tn,
    precision: tp / Math.max(1, tp + fp),
    recall: tp / Math.max(1, tp + fn),
    falsePositives,
    falseNegatives,
  };
}
