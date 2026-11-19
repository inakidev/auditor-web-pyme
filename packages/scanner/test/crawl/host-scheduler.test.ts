import { describe, expect, it } from 'vitest';
import { HostScheduler } from '../../src/crawl/host-scheduler.js';

import { createFakeClock as fakeClock } from '../support/fake-clock.js';

describe('HostScheduler (1 request por segundo por host, compartido)', () => {
  it('espacia los inicios en el mismo host aunque vengan de trabajos distintos', async () => {
    const clock = fakeClock();
    const scheduler = new HostScheduler({ intervalMs: 1000, ...clock });
    const starts: number[] = [];
    const task = () => {
      starts.push(clock.now());
      return Promise.resolve();
    };
    // Dos "auditorías" en paralelo sobre el mismo host.
    await Promise.all([
      scheduler.run('ejemplo.com', task),
      scheduler.run('ejemplo.com', task),
      scheduler.run('ejemplo.com', task),
    ]);
    // Con reloj fraccionario: cada inicio queda al menos 1 s después del anterior.
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1000);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1000);
    expect(starts[2]! - starts[0]!).toBeLessThan(2010);
  });

  it('no frena hosts distintos', async () => {
    const clock = fakeClock();
    const scheduler = new HostScheduler({ intervalMs: 1000, ...clock });
    const starts: number[] = [];
    const task = () => {
      starts.push(clock.now());
      return Promise.resolve();
    };
    await Promise.all([scheduler.run('a.com', task), scheduler.run('b.com', task)]);
    expect(starts[1]! - starts[0]!).toBeLessThan(5);
  });

  it('una tarea que falla no bloquea a las siguientes', async () => {
    const clock = fakeClock();
    const scheduler = new HostScheduler({ intervalMs: 1000, ...clock });
    const failing = scheduler.run('a.com', () => Promise.reject(new Error('x')));
    const next = scheduler.run('a.com', () => Promise.resolve('ok'));
    await expect(failing).rejects.toThrow('x');
    await expect(next).resolves.toBe('ok');
  });

  it('una señal abortada cancela la espera sin ejecutar la tarea', async () => {
    const clock = fakeClock();
    const scheduler = new HostScheduler({ intervalMs: 1000, ...clock });
    let ran = false;
    await scheduler.run('a.com', () => Promise.resolve());
    await expect(
      scheduler.run(
        'a.com',
        () => {
          ran = true;
          return Promise.resolve();
        },
        AbortSignal.abort(),
      ),
    ).rejects.toThrow();
    expect(ran).toBe(false);
    await expect(scheduler.run('a.com', () => Promise.resolve(1))).resolves.toBe(1);
  });
});
