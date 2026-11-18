// Planificador compartido entre trabajos: 1 request por segundo por host (CLAUDE.md, regla 3).
// Cuenta desde el inicio de cada request, así una respuesta lenta no frena de más.

export interface HostSchedulerOptions {
  readonly intervalMs: number;
  /** Reloj monotónico en milisegundos. */
  readonly now: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class HostScheduler {
  readonly #options: HostSchedulerOptions;
  readonly #tails = new Map<string, Promise<void>>();
  readonly #lastStart = new Map<string, number>();

  constructor(options: HostSchedulerOptions) {
    this.#options = options;
  }

  async run<T>(host: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const key = host.toLowerCase();
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => turn);
    this.#tails.set(key, tail);

    try {
      await previous;
      signal?.throwIfAborted();
      const last = this.#lastStart.get(key);
      if (last !== undefined) {
        const wait = this.#options.intervalMs - (this.#options.now() - last);
        if (wait > 0) await this.#options.sleep(wait, signal);
      }
      signal?.throwIfAborted();
      this.#lastStart.set(key, this.#options.now());
    } finally {
      release();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
      this.#purge();
    }
    return task();
  }

  /** Olvida los hosts sin actividad reciente para no acumular memoria. */
  #purge(): void {
    const limit = this.#options.now() - this.#options.intervalMs;
    for (const [host, start] of this.#lastStart) {
      if (start < limit && !this.#tails.has(host)) this.#lastStart.delete(host);
    }
  }
}
