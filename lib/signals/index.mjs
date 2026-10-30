/**
 * Optional importance signals, off by default.
 *
 *   SIGNAL_WIKIPEDIA=1   pageview spike of a cluster's top entity (<= 4 pts)
 *   SIGNAL_GDELT=1       GDELT volume cross-check (<= 2 pts)
 *
 * The combined bonus is capped at MAX_SIGNAL_BONUS (4) and applies to the
 * cluster's lead article only. Everything here is best effort under a hard
 * deadline: a slow or failing API yields no bonus and never affects ingest.
 */

import { wikipediaSignal } from './wikipedia.mjs';
import { gdeltSignal } from './gdelt.mjs';

export const MAX_SIGNAL_BONUS = 4;
export const SIGNAL_TOP_CLUSTERS = 8;
export const SIGNAL_DEADLINE_MS = 3000;

export function signalFlags(env = process.env) {
  const on = (v) => v === '1' || v === 'true';
  return { wikipedia: on(env?.SIGNAL_WIKIPEDIA), gdelt: on(env?.SIGNAL_GDELT) };
}

/**
 * Compute signal bonuses for the strongest clusters.
 *
 * @param {Array<{id:string, entities?:string[], breadth?:number}>} clusters  best first
 * @returns {Promise<Map<string,{points:number, notes:string[]}>>} clusterId -> bonus (only > 0)
 */
export async function clusterSignalBonuses(clusters, opts = {}) {
  const out = new Map();
  try {
    const flags = opts.flags || signalFlags(opts.env);
    if (!flags.wikipedia && !flags.gdelt) return out;
    const { fetchImpl = fetch, now = Date.now(), topK = SIGNAL_TOP_CLUSTERS, deadlineMs = SIGNAL_DEADLINE_MS } = opts;

    const targets = clusters.filter((c) => c.entities?.length).slice(0, topK);
    const work = Promise.all(
      targets.map(async (c) => {
        const [wiki, gd] = await Promise.all([
          flags.wikipedia ? wikipediaSignal(c.entities[0], { fetchImpl, now, cacheMap: opts.wikiCache }) : null,
          flags.gdelt ? gdeltSignal(c.entities, { fetchImpl, now, cacheMap: opts.gdeltCache, clock: opts.gdeltClock }) : null,
        ]);
        const notes = [];
        let points = 0;
        if (wiki?.points > 0) {
          points += wiki.points;
          notes.push(`Wikipedia views ${wiki.ratio.toFixed(1)}x baseline for ${c.entities[0]}`);
        }
        if (gd?.points > 0) {
          points += gd.points;
          notes.push(`GDELT volume ${gd.ratio.toFixed(1)}x previous day`);
        }
        points = Math.round(Math.min(MAX_SIGNAL_BONUS, points) * 10) / 10;
        if (points > 0) out.set(c.id, { points, notes });
      })
    );
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(resolve, deadlineMs);
    });
    await Promise.race([work.catch(() => {}), deadline]);
    clearTimeout(timer);
  } catch {
    /* signals never break ingest */
  }
  return new Map(out); // snapshot: late finishers after the deadline are ignored
}
