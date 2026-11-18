export interface JobQueueOptions<T> {
  readonly concurrency: number;
  /** Trabajos en espera como máximo (sin contar los que corren). */
  readonly maxPending: number;
  readonly run: (job: T) => Promise<void>;
  readonly onError?: (job: T, error: unknown) => void;
}

/** Cola en proceso con concurrencia limitada y espera acotada (CLAUDE.md, regla 6). */
export class JobQueue<T> {
  readonly #options: JobQueueOptions<T>;
  readonly #pending: T[] = [];
  #running = 0;
  #idleWaiters: (() => void)[] = [];

  constructor(options: JobQueueOptions<T>) {
    this.#options = options;
  }

  get size(): { running: number; pending: number } {
    return { running: this.#running, pending: this.#pending.length };
  }

  canAccept(): boolean {
    return (
      this.#running < this.#options.concurrency || this.#pending.length < this.#options.maxPending
    );
  }

  enqueue(job: T): boolean {
    if (!this.canAccept()) return false;
    this.#pending.push(job);
    this.#drain();
    return true;
  }

  /** Resuelve cuando no queda nada corriendo ni en espera. */
  idle(): Promise<void> {
    if (this.#isIdle()) return Promise.resolve();
    return new Promise((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }

  #isIdle(): boolean {
    return this.#running === 0 && this.#pending.length === 0;
  }

  #drain(): void {
    while (this.#running < this.#options.concurrency) {
      const job = this.#pending.shift();
      if (job === undefined) break;
      this.#running += 1;
      void this.#runJob(job);
    }
    if (this.#isIdle()) {
      const waiters = this.#idleWaiters;
      this.#idleWaiters = [];
      waiters.forEach((resolve) => {
        resolve();
      });
    }
  }

  async #runJob(job: T): Promise<void> {
    try {
      await this.#options.run(job);
    } catch (error) {
      this.#options.onError?.(job, error);
    } finally {
      this.#running -= 1;
      this.#drain();
    }
  }
}
