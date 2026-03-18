import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { AcpSessionSupervisionService } from '../services/acp-session-supervision-service';
import {
  createAcpSessionSupervisionService,
} from '../services/acp-session-supervision-service';
import { runAcpSessionSupervisionTick } from '../services/acp-service';

declare module 'fastify' {
  interface FastifyInstance {
    acpSessionSupervisionService: AcpSessionSupervisionService;
  }
}

interface AcpSessionSupervisionPluginOptions {
  enabled?: boolean;
  intervalMs?: number;
}

const acpSessionSupervisionPlugin: FastifyPluginAsync<
  AcpSessionSupervisionPluginOptions
> = async (fastify, options) => {
  const acpSessionSupervisionService = createAcpSessionSupervisionService({
    intervalMs: options.intervalMs,
    logger: fastify.log,
    tick: async () =>
      runAcpSessionSupervisionTick(
        fastify.sqlite,
        fastify.acpStreamBroker,
        fastify.acpRuntime,
        {
          logger: fastify.log,
          source: 'acp-session-supervision',
        },
      ),
  });

  fastify.decorate(
    'acpSessionSupervisionService',
    acpSessionSupervisionService,
  );

  if (options.enabled !== false) {
    fastify.addHook('onReady', async () => {
      acpSessionSupervisionService.start();
    });
  }

  fastify.addHook('onClose', async () => {
    acpSessionSupervisionService.stop();
  });
};

export default fp(acpSessionSupervisionPlugin, {
  name: 'acp-session-supervision',
  dependencies: ['sqlite', 'acp-runtime', 'acp-stream'],
});
