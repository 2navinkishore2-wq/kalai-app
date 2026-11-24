import { beforeEach, describe, expect, it } from 'vitest';
import { clearShutdownFlush, flushBeforeExit, registerShutdownFlush } from './appShutdown';

describe('flushBeforeExit', () => {
  beforeEach(() => clearShutdownFlush());

  it('reports settled writes before the app closes for an update', async () => {
    registerShutdownFlush(async () => ({ pending: 0, timedOut: false }));
    await expect(flushBeforeExit(1000)).resolves.toEqual({ pending: 0, timedOut: false });
  });

  it('keeps a queued offline write instead of discarding it', async () => {
    registerShutdownFlush(async () => ({ pending: 3, timedOut: true }));
    const result = await flushBeforeExit(1000);
    expect(result.pending).toBe(3);
    expect(result.timedOut).toBe(true);
  });

  it('never hangs the update when the data service is stuck', async () => {
    registerShutdownFlush(() => new Promise(() => {}));
    const result = await flushBeforeExit(50);
    expect(result.timedOut).toBe(true);
  }, 10000);

  it('resolves immediately when no data service is registered', async () => {
    await expect(flushBeforeExit(1000)).resolves.toEqual({ pending: 0, timedOut: false });
  });
});
