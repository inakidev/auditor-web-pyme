import { describe, expect, it } from 'vitest';
import { JobQueue } from './queue.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('JobQueue', () => {
  it('respeta la concurrencia máxima', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let running = 0;
    let maxRunning = 0;
    const queue = new JobQueue<number>({
      concurrency: 2,
      maxPending: 10,
      run: async (n) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await gates[n]?.promise;
        running -= 1;
      },
    });
    [0, 1, 2].forEach((n) => queue.enqueue(n));
    expect(queue.size).toEqual({ running: 2, pending: 1 });
    gates.forEach((g) => {
      g.resolve();
    });
    await queue.idle();
    expect(maxRunning).toBe(2);
  });

  it('rechaza trabajos cuando la espera está llena', () => {
    const queue = new JobQueue<number>({
      concurrency: 1,
      maxPending: 1,
      run: () => new Promise(() => undefined),
    });
    expect(queue.enqueue(1)).toBe(true); // corre
    expect(queue.canAccept()).toBe(true);
    expect(queue.enqueue(2)).toBe(true); // espera
    expect(queue.canAccept()).toBe(false);
    expect(queue.enqueue(3)).toBe(false);
  });

  it('un trabajo que falla no frena la cola', async () => {
    const done: number[] = [];
    const queue = new JobQueue<number>({
      concurrency: 1,
      maxPending: 5,
      run: (n) => {
        if (n === 1) return Promise.reject(new Error('falla'));
        done.push(n);
        return Promise.resolve();
      },
    });
    [1, 2].forEach((n) => queue.enqueue(n));
    await queue.idle();
    expect(done).toEqual([2]);
  });
});
