import type { DiagnosticLogger } from '../diagnostics';
import type { BackgroundTaskPayload } from '../schemas/background-task';

export interface BackgroundWorkerTickResult {
  completed: BackgroundTaskPayload[];
  dispatched: BackgroundTaskPayload[];
}

export interface BackgroundWorkerHostService {
  isRunning(): boolean;
  start(): void;
  stop(): void;
  tickNow(): Promise<BackgroundWorkerTickResult>;
}

interface CreateBackgroundWorkerHostServiceInput {
  intervalMs?: number;
  logger?: DiagnosticLogger;
  tick: () => Promise<BackgroundWorkerTickResult>;
}

export function createBackgroundWorkerHostService(
  input: CreateBackgroundWorkerHostServiceInput,
): BackgroundWorkerHostService {
  const intervalMs = input.intervalMs ?? 5_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let tickInFlight: Promise<BackgroundWorkerTickResult> | null = null;

  async function tickNow() {
    if (tickInFlight) {
      return tickInFlight;
    }

    tickInFlight = (async () => {
      try {
        const result = await input.tick();
        if (result.dispatched.length > 0 || result.completed.length > 0) {
          input.logger?.info?.(
            {
              completedTaskIds: result.completed.map((task) => task.id),
              dispatchedTaskIds: result.dispatched.map((task) => task.id),
            },
            'Background worker tick processed tasks',
          );
        }

        return result;
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
          'Background worker tick failed',
        );

        return {
          completed: [],
          dispatched: [],
        };
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
