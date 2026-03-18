import type { DiagnosticLogger } from '@orchestration/runtime-acp';

export interface AcpSessionSupervisionService {
  isRunning(): boolean;
  start(): void;
  stop(): void;
  tickNow(): Promise<void>;
}

interface CreateAcpSessionSupervisionServiceInput {
  intervalMs?: number;
  logger?: DiagnosticLogger;
  tick: () => Promise<{
    checkedSessionIds: string[];
    forcedSessionIds: string[];
    timedOutSessionIds: string[];
  }>;
}

export function createAcpSessionSupervisionService(
  input: CreateAcpSessionSupervisionServiceInput,
): AcpSessionSupervisionService {
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
        if (
          result.timedOutSessionIds.length > 0 ||
          result.forcedSessionIds.length > 0
        ) {
          input.logger?.info?.(result, 'ACP session supervision enforced');
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
          'ACP session supervision tick failed',
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
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
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
