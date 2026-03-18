import type { DiagnosticLogger } from '@orchestration/runtime-acp';

export interface SchedulerService {
  isRunning(): boolean;
  start(): void;
  stop(): void;
  tickNow(): Promise<void>;
}

interface CreateSchedulerServiceInput {
  intervalMs?: number;
  logger?: DiagnosticLogger;
  tick: () => Promise<{
    firedScheduleIds: string[];
    workflowRunIds: string[];
  }>;
}

export function createSchedulerService(
  input: CreateSchedulerServiceInput,
): SchedulerService {
  const intervalMs = input.intervalMs ?? 60_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let tickInFlight: Promise<void> | null = null;

  async function tickNow() {
    if (tickInFlight) {
      return tickInFlight;
    }

    tickInFlight = (async () => {
      try {
        const result = await input.tick();
        if (result.firedScheduleIds.length > 0) {
          input.logger?.info?.(
            {
              firedScheduleIds: result.firedScheduleIds,
              workflowRunIds: result.workflowRunIds,
            },
            'Scheduler tick fired schedules',
          );
        }
      } catch (error) {
        input.logger?.error?.(
          {
            error:
              error instanceof Error
                ? {
                    message: error.message,
                    stack: error.stack,
                  }
                : String(error),
          },
          'Scheduler tick failed',
        );
      } finally {
        tickInFlight = null;
      }
    })();

    return tickInFlight;
  }

  return {
    isRunning() {
      return timer !== null;
    },

    start() {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void tickNow();
      }, intervalMs);
    },

    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = null;
    },

    tickNow,
  };
}
