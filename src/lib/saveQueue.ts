import type { Renewal } from '../types';

type TimerHandle = ReturnType<typeof setTimeout>;

export interface SaveQueueOptions {
  save: (renewal: Renewal) => Promise<void>;
  onDirty?: () => void;
  onSaved?: (savedAt: number) => void;
  onError?: (error: unknown) => void;
  retryDelayMs?: (attempt: number) => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
}

/**
 * Autosave queue with retry and failure retention.
 *
 * Guarantees:
 * - A failed snapshot stays queued until a later save succeeds.
 * - A newer edit for the same renewal always remains newer; a retry never
 *   replaces it with the older failed snapshot.
 * - `flush()` returns false when anything is still unsaved, so dependent
 *   operations can abort rather than discard work.
 */
export class SaveQueue {
  private pending = new Map<string, Renewal>();
  private inFlight: Promise<boolean> | null = null;
  private retryTimer: TimerHandle | null = null;
  private attempts = 0;
  private disposed = false;
  private errorActive = false;

  private readonly options: SaveQueueOptions;
  private readonly schedule: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly cancel: (handle: TimerHandle) => void;

  constructor(options: SaveQueueOptions) {
    this.options = options;
    this.schedule =
      options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  }

  enqueue(renewal: Renewal): void {
    if (this.disposed) return;
    this.pending.set(renewal.id, renewal);
    this.options.onDirty?.();
  }

  peek(id: string): Renewal | undefined {
    return this.pending.get(id);
  }

  pendingCount(): number {
    return this.pending.size;
  }

  remove(id: string): void {
    this.pending.delete(id);
  }

  dispose(): void {
    this.disposed = true;
    this.clearRetry();
    this.pending.clear();
  }

  async flush(): Promise<boolean> {
    if (this.disposed) return false;
    this.clearRetry();
    if (this.inFlight) return this.inFlight;

    const run = this.run();
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  private async run(): Promise<boolean> {
    const hadPending = this.pending.size > 0;
    let failed = false;
    let failure: unknown = null;

    // Multiple passes let a save that started before a newer edit finish
    // without dropping the newer edit; the newer snapshot is saved next.
    for (let pass = 0; pass < 4; pass += 1) {
      const entries = [...this.pending.entries()];
      if (entries.length === 0) break;

      const results = await Promise.allSettled(
        entries.map(([, renewal]) => this.options.save(renewal)),
      );

      let savedAny = false;
      results.forEach((result, index) => {
        const [id, snapshot] = entries[index];
        if (result.status === 'fulfilled') {
          savedAny = true;
          // Only clear the snapshot that was actually written. A newer edit
          // queued while this save was in flight must survive.
          if (this.pending.get(id) === snapshot) {
            this.pending.delete(id);
          }
        } else {
          failed = true;
          if (failure === null) failure = result.reason;
        }
      });

      if (!savedAny || failed) break;
    }

    if (!failed && this.pending.size === 0) {
      this.attempts = 0;
      this.errorActive = false;
      if (hadPending) this.options.onSaved?.(Date.now());
      return true;
    }

    if (failed) {
      this.attempts += 1;
      if (!this.errorActive) {
        this.errorActive = true;
        this.options.onError?.(failure);
      }
      this.scheduleRetry();
      return false;
    }

    // Edits arrived during the last pass. Keep them queued and report that
    // the queue is not empty so dependent operations wait.
    this.scheduleRetry(0);
    return false;
  }

  private scheduleRetry(minimumDelay?: number): void {
    if (this.disposed || this.retryTimer !== null) return;

    const attempt = Math.max(1, this.attempts);
    const delay =
      minimumDelay ??
      this.options.retryDelayMs?.(attempt) ??
      Math.min(1000 * 2 ** (attempt - 1), 15000);

    this.retryTimer = this.schedule(() => {
      this.retryTimer = null;
      void this.flush();
    }, Math.max(0, delay));
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.cancel(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

/**
 * Runs a dependent mutation only when every queued edit is safely persisted.
 * Used by navigation, create, duplicate, delete, and restore so a failed save
 * cannot be silently discarded by moving on.
 */
export async function runAfterSave(
  queue: SaveQueue,
  action: () => void | Promise<void>,
): Promise<boolean> {
  const saved = await queue.flush();
  if (!saved) return false;
  await action();
  return true;
}
