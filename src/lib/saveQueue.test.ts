import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Renewal } from '../types';
import { makeRenewal } from './testHelpers';
import { SaveQueue, runAfterSave } from './saveQueue';

function version(id: string, updatedAt: number): Renewal {
  return {
    ...makeRenewal(),
    id,
    updatedAt,
    company: {
      ...makeRenewal().company,
      locationName: `Version ${updatedAt}`,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SaveQueue failure retention', () => {
  it('keeps a failed save queued and retries it successfully', async () => {
    let failing = true;
    const saved: Renewal[] = [];
    const queue = new SaveQueue({
      save: async (renewal) => {
        if (failing) throw new Error('disk unavailable');
        saved.push(renewal);
      },
      retryDelayMs: () => 60000,
    });

    const first = version('renewal-1', 100);
    queue.enqueue(first);

    await expect(queue.flush()).resolves.toBe(false);
    expect(queue.pendingCount()).toBe(1);
    expect(queue.peek('renewal-1')).toBe(first);
    expect(saved).toHaveLength(0);

    failing = false;
    await expect(queue.flush()).resolves.toBe(true);
    expect(queue.pendingCount()).toBe(0);
    expect(saved).toEqual([first]);
    queue.dispose();
  });

  it('does not let a failed older snapshot replace a newer edit', async () => {
    let failing = true;
    const saved: Renewal[] = [];
    const queue = new SaveQueue({
      save: async (renewal) => {
        if (failing) throw new Error('disk unavailable');
        saved.push(renewal);
      },
      retryDelayMs: () => 60000,
    });

    const older = version('renewal-1', 100);
    const newer = version('renewal-1', 200);

    queue.enqueue(older);
    await expect(queue.flush()).resolves.toBe(false);
    expect(queue.peek('renewal-1')).toBe(older);

    queue.enqueue(newer);
    expect(queue.peek('renewal-1')).toBe(newer);

    failing = false;
    await expect(queue.flush()).resolves.toBe(true);
    expect(saved).toEqual([newer]);
    expect(queue.pendingCount()).toBe(0);
    queue.dispose();
  });

  it('saves a newer edit that arrives while an older save is in flight', async () => {
    const firstSave = deferred<void>();
    const saved: Renewal[] = [];
    let call = 0;
    const queue = new SaveQueue({
      save: async (renewal) => {
        call += 1;
        if (call === 1) await firstSave.promise;
        saved.push(renewal);
      },
      retryDelayMs: () => 60000,
    });

    const older = version('renewal-1', 100);
    const newer = version('renewal-1', 200);

    queue.enqueue(older);
    const flushing = queue.flush();
    queue.enqueue(newer);
    firstSave.resolve();

    await expect(flushing).resolves.toBe(true);
    expect(saved).toEqual([older, newer]);
    expect(queue.pendingCount()).toBe(0);
    queue.dispose();
  });

  it('retries automatically after a transient failure', async () => {
    vi.useFakeTimers();
    let failing = true;
    const saved: Renewal[] = [];
    const queue = new SaveQueue({
      save: async (renewal) => {
        if (failing) throw new Error('transient');
        saved.push(renewal);
      },
      retryDelayMs: () => 1000,
    });

    queue.enqueue(version('renewal-1', 100));
    await expect(queue.flush()).resolves.toBe(false);
    expect(queue.pendingCount()).toBe(1);

    failing = false;
    await vi.advanceTimersByTimeAsync(1000);

    expect(queue.pendingCount()).toBe(0);
    expect(saved).toHaveLength(1);
    queue.dispose();
  });

  it('reports failure through the callback and recovers', async () => {
    const onError = vi.fn();
    const onSaved = vi.fn();
    let failing = true;
    const queue = new SaveQueue({
      save: async () => {
        if (failing) throw new Error('boom');
      },
      onError,
      onSaved,
      retryDelayMs: () => 60000,
    });

    queue.enqueue(version('renewal-1', 100));
    await queue.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    failing = false;
    await queue.flush();
    expect(onSaved).toHaveBeenCalledTimes(1);
    queue.dispose();
  });
});

describe('dependent operations', () => {
  it('does not run a mutation when queued edits cannot be saved', async () => {
    let failing = true;
    const queue = new SaveQueue({
      save: async () => {
        if (failing) throw new Error('disk unavailable');
      },
      retryDelayMs: () => 60000,
    });
    const mutation = vi.fn();

    queue.enqueue(version('renewal-1', 100));
    await expect(runAfterSave(queue, mutation)).resolves.toBe(false);
    expect(mutation).not.toHaveBeenCalled();
    expect(queue.pendingCount()).toBe(1);

    failing = false;
    await expect(runAfterSave(queue, mutation)).resolves.toBe(true);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(queue.pendingCount()).toBe(0);
    queue.dispose();
  });
});
