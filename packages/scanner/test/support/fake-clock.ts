// Reloj falso para pruebas. Por defecto cada lectura avanza una fracción de milisegundo, como
// performance.now(): así se detectan errores con valores no enteros (defecto D-01).

export interface FakeClock {
  /** Lee el reloj y lo hace avanzar `stepMs`. */
  readonly now: () => number;
  /** Espera falsa: avanza el reloj sin esperar de verdad. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly advance: (ms: number) => void;
}

export function createFakeClock(options: { stepMs?: number; start?: number } = {}): FakeClock {
  let time = options.start ?? 0;
  const step = options.stepMs ?? 0.37;
  return {
    now: () => (time += step),
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
    advance: (ms) => {
      time += ms;
    },
  };
}
