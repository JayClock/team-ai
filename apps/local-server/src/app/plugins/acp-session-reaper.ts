import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const DEFAULT_REAP_INTERVAL_MS = 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000;

interface AcpSessionReaperPluginOptions {
  enabled?: boolean;
  idleTimeoutMs?: number;
  intervalMs?: number;
}

const acpSessionReaperPlugin: FastifyPluginAsync<
  AcpSessionReaperPluginOptions
> = async (fastify, options) => {
  const intervalMs = options.intervalMs ?? DEFAULT_REAP_INTERVAL_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let reapInFlight = false;

  const reapIdleSessions = async () => {
    if (reapInFlight) {
      return;
    }

    const sessions = fastify.acpRuntime.listSessions?.();
    if (!sessions || sessions.length === 0) {
      return;
    }

    reapInFlight = true;
    try {
      const now = Date.now();
      for (const session of sessions) {
        if (session.isBusy) {
          continue;
        }

        if (fastify.acpStreamBroker.countSubscribers(session.localSessionId) > 0) {
          continue;
        }

        const lastTouchedAtMs = Date.parse(session.lastTouchedAt);
        if (Number.isNaN(lastTouchedAtMs)) {
          continue;
        }

        if (now - lastTouchedAtMs < idleTimeoutMs) {
          continue;
        }

        fastify.log.info(
          {
            idleTimeoutMs,
            lastTouchedAt: session.lastTouchedAt,
            localSessionId: session.localSessionId,
            provider: session.provider,
            runtimeSessionId: session.runtimeSessionId,
          },
          'Reaping idle ACP session runtime',
        );
        await fastify.acpRuntime.killSession(session.localSessionId);
      }
    } finally {
      reapInFlight = false;
    }
  };

  if (options.enabled !== false) {
    fastify.addHook('onReady', async () => {
      timer = setInterval(() => {
        void reapIdleSessions();
      }, intervalMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
  }

  fastify.addHook('onClose', async () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });
};

export default fp(acpSessionReaperPlugin, {
  name: 'acp-session-reaper',
  dependencies: ['acp-runtime', 'acp-stream'],
});
