import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { recoverActiveOrchestrationSessions } from '../services/orchestration-service';

const orchestrationRuntimePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onReady', async () => {
    await recoverActiveOrchestrationSessions(
      fastify.sqlite,
      fastify.orchestrationStreamBroker,
    );
  });
};

export default fp(orchestrationRuntimePlugin, {
  name: 'orchestration-runtime',
  dependencies: ['sqlite', 'orchestration-stream'],
});
