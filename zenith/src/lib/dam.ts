// ─── The Water-Dam: backpressure for an overflowing backend ───────────────────
//
// A dam sits in front of a resource (Firestore writes, auth attempts, AI calls).
// Work flows in; the dam releases it downstream at a controlled rate so a sudden
// surge of users can never flood the resource:
//
//   inflow ──▶ │reservoir│ ──(drain at ratePerSec)──▶ resource
//              │  ~~~~~~ │
//              │  ~~~~~~ │ ◀─ capacity (max queued)
//              └─────────┘
//        spillway ▲ when full → request is rejected (DamOverflowError)
//
// Mechanism: a token bucket meters the drain rate (sustained `ratePerSec`, short
// `burst`), a bounded queue is the reservoir, and `maxConcurrent` caps how many
// tasks run at once. When the reservoir is full the dam "spills" — schedule()
// rejects so the caller can back off instead of overwhelming the backend.

export class DamOverflowError extends Error {
  constructor(public readonly damName: string) {
    super(`${damName}: reservoir at capacity — request spilled. Please slow down.`);
    this.name = 'DamOverflowError';
  }
}

export interface DamOptions {
  name: string;
  /** max tasks waiting in the reservoir before new ones spill */
  capacity: number;
  /** sustained drain rate (tasks per second) */
  ratePerSec: number;
  /** bucket size — how big a momentary burst may pass (default = ratePerSec) */
  burst?: number;
  /** max tasks running concurrently (default 4) */
  maxConcurrent?: number;
}

export interface DamMetrics {
  name: string;
  queued: number;
  inflight: number;
  capacity: number;
  /** reservoir fullness, 0..1 */
  level: number;
  admitted: number;
  completed: number;
  spilled: number;
  tokens: number;
  /** true while the reservoir is non-empty (water is being held back) */
  holding: boolean;
}

interface Job { run: () => Promise<any> | any; resolve: (v: any) => void; reject: (e: any) => void }

export class Dam {
  readonly name: string;
  readonly capacity: number;
  private readonly rate: number;
  private readonly burst: number;
  private readonly maxConcurrent: number;

  private queue: Job[] = [];
  private inflight = 0;
  private tokens: number;
  private lastRefill = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;

  private admitted = 0;
  private completed = 0;
  private spilled = 0;

  private listeners = new Set<(m: DamMetrics) => void>();

  constructor(opts: DamOptions) {
    this.name = opts.name;
    this.capacity = Math.max(1, opts.capacity);
    this.rate = Math.max(0.001, opts.ratePerSec);
    this.burst = Math.max(1, opts.burst ?? opts.ratePerSec);
    this.maxConcurrent = Math.max(1, opts.maxConcurrent ?? 4);
    this.tokens = this.burst;
    DAMS.set(this.name, this);
  }

  /**
   * Queue a task behind the dam. Resolves with the task's result once the dam
   * releases and runs it. Rejects with DamOverflowError if the reservoir is full.
   */
  schedule<T>(task: () => Promise<T> | T): Promise<T> {
    if (this.queue.length >= this.capacity) {
      this.spilled++;
      this.emit();
      return Promise.reject(new DamOverflowError(this.name));
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ run: task, resolve, reject });
      this.admitted++;
      this.emit();
      this.pump();
    });
  }

  /** Would the next schedule() spill? (Cheap pre-check for friendly UI.) */
  get willSpill(): boolean {
    return this.queue.length >= this.capacity;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
    this.lastRefill = now;
  }

  private pump(): void {
    this.refill();
    while (this.queue.length && this.inflight < this.maxConcurrent && this.tokens >= 1) {
      this.tokens -= 1;
      const job = this.queue.shift()!;
      this.inflight++;
      this.emit();
      Promise.resolve()
        .then(job.run)
        .then(
          (v) => job.resolve(v),
          (e) => job.reject(e),
        )
        .finally(() => {
          this.inflight--;
          this.completed++;
          this.emit();
          this.pump();
        });
    }
    // still water waiting but out of tokens/slots → wake when a token refills
    if (this.queue.length && !this.timer) {
      const needed = this.inflight >= this.maxConcurrent ? 60 : Math.max(15, (1 / this.rate) * 1000);
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, needed);
    }
  }

  metrics(): DamMetrics {
    this.refill();
    return {
      name: this.name,
      queued: this.queue.length,
      inflight: this.inflight,
      capacity: this.capacity,
      level: this.queue.length / this.capacity,
      admitted: this.admitted,
      completed: this.completed,
      spilled: this.spilled,
      tokens: Math.floor(this.tokens),
      holding: this.queue.length > 0 || this.inflight > 0,
    };
  }

  onChange(cb: (m: DamMetrics) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    if (!this.listeners.size) return;
    const m = this.metrics();
    this.listeners.forEach((cb) => { try { cb(m); } catch { /* ignore */ } });
  }
}

/** registry so settings/diagnostics can show every dam's level */
export const DAMS = new Map<string, Dam>();

// ─── App dams ─────────────────────────────────────────────────────────────────

/**
 * Auth dam — guards sign-in / sign-up. Tight: ~1 attempt/sec sustained, a small
 * burst, and it SPILLS after a handful queue up, throttling brute-force / spam.
 */
export const authDam = new Dam({ name: 'auth', capacity: 8, ratePerSec: 1, burst: 4, maxConcurrent: 1 });

/**
 * Sync dam — guards Firestore writes. Generous reservoir so it (almost) never
 * spills; instead it DRAINS write-batches at a steady rate so a burst of edits
 * from many users can't spike past free-tier quota.
 */
export const syncDam = new Dam({ name: 'sync', capacity: 4000, ratePerSec: 8, burst: 16, maxConcurrent: 2 });

/** AI dam — paces model calls so rapid-fire requests don't trip provider limits. */
export const aiDam = new Dam({ name: 'ai', capacity: 24, ratePerSec: 2, burst: 3, maxConcurrent: 2 });
