import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSchedulerService } from './scheduler-service';

describe('scheduler service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks on the configured interval and can be stopped', async () => {
    const tick = vi.fn(async () => ({
      firedScheduleIds: ['sch_1'],
      workflowRunIds: ['wfr_1'],
    }));
    const scheduler = createSchedulerService({
      intervalMs: 1000,
      tick,
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(tick).toHaveBeenCalledTimes(2);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('does not overlap ticks while one is still in flight', async () => {
    let resolveTick: (() => void) | null = null;
    const tick = vi.fn(
      () =>
        new Promise<{
          firedScheduleIds: string[];
          workflowRunIds: string[];
        }>((resolve) => {
          resolveTick = () => resolve({ firedScheduleIds: [], workflowRunIds: [] });
        }),
    );
    const scheduler = createSchedulerService({
      intervalMs: 1000,
      tick,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(tick).toHaveBeenCalledTimes(1);

    resolveTick?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);

    expect(tick).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
