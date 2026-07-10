/**
 * Lightweight observability for the AI pipeline. In-memory counters only —
 * enough to make model usage, cache behaviour and validation failures
 * measurable (they're surfaced via /api/intel/metrics) without adding any
 * external dependency.
 */

const g = globalThis;
if (!g.__meridianMetrics) {
  g.__meridianMetrics = {
    startedAt: Date.now(),
    modelCalls: 0,
    modelErrors: 0,
    modelLatencyMs: 0,
    retries: 0,
    validationFailures: 0,
    cacheHits: 0,
    cacheMisses: 0,
    fallbacks: 0,
  };
}
const metrics = g.__meridianMetrics;

export function recordCacheHit() {
  metrics.cacheHits++;
}
export function recordCacheMiss() {
  metrics.cacheMisses++;
}
export function recordValidationFailure() {
  metrics.validationFailures++;
}
export function recordRetry() {
  metrics.retries++;
}
export function recordFallback() {
  metrics.fallbacks++;
}

/** Wrap a model call so latency, success and failure are counted. */
export async function timedModelCall(fn) {
  const t0 = Date.now();
  metrics.modelCalls++;
  try {
    return await fn();
  } catch (err) {
    metrics.modelErrors++;
    throw err;
  } finally {
    metrics.modelLatencyMs += Date.now() - t0;
  }
}

export function snapshotMetrics() {
  return {
    ...metrics,
    avgModelLatencyMs: metrics.modelCalls
      ? Math.round(metrics.modelLatencyMs / metrics.modelCalls)
      : 0,
  };
}
