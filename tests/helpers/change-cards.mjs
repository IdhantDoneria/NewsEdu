/**
 * Replay labelled change cards (tests/fixtures/labels/change-cards.json,
 * rows shaped { cluster, snapshot, expectChange }) through a detectChanges
 * implementation and report precision/recall.
 */
import fs from 'node:fs';

export const CARD_SET = JSON.parse(
  fs.readFileSync(new URL('../fixtures/labels/change-cards.json', import.meta.url), 'utf8')
);

/** detect(cluster, snapshot) -> { changes } */
export function evaluateCards(detect, cards = CARD_SET.items) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const falsePositives = [];
  const falseNegatives = [];
  for (const card of cards) {
    const emitted = detect(card.cluster, card.snapshot).changes.length > 0;
    const title = card.cluster.articles[1].title;
    if (emitted && card.expectChange) tp++;
    else if (emitted) {
      fp++;
      falsePositives.push(title);
    } else if (card.expectChange) {
      fn++;
      falseNegatives.push(title);
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
