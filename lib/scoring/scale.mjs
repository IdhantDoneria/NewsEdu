/**
 * Score scale: the unclamped `rankScore` is the only sort key; `displayScore`
 * is a monotonic 0-100 map used for the dial and the noise floor.
 *
 * Below the knee the map is the identity, so a display value of 60 means a
 * rank of 60 and the noise floor reads the same on either scale. Above the
 * knee it saturates smoothly towards 100 (C1-continuous), so exceptional
 * stories stay distinguishable on screen instead of piling up at 100.
 */

export const DISPLAY_KNEE = 90;
export const DISPLAY_TAU = 10; // 100 - KNEE = asymptote head-room

/** Monotonic non-decreasing map from an unclamped rank to an integer 0-100. */
export function displayScore(rank, edition) { // eslint-disable-line no-unused-vars
  if (!Number.isFinite(rank)) return 0;
  if (rank <= 0) return 0;
  if (rank <= DISPLAY_KNEE) return Math.round(rank);
  const head = 100 - DISPLAY_KNEE;
  const v = DISPLAY_KNEE + head * (1 - Math.exp(-(rank - DISPLAY_KNEE) / DISPLAY_TAU));
  return Math.min(100, Math.round(v));
}

/**
 * Canonical receipt total: the same left-to-right sum the pipelines use for
 * `rankScore`, so `receiptTotal(scoreBreakdown) === rankScore` bit for bit.
 */
export function receiptTotal(layers) {
  let sum = 0;
  for (const l of layers || []) sum += l.delta;
  return sum;
}
