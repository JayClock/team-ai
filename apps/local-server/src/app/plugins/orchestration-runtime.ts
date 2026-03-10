import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { recoverActiveOrchestrationSessions } from '../services/orchestration-service';

const orchestrationRuntimePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onReady', async () => {
    setImmediate(() => {
      void recoverActiveOrchestrationSessions(
        fastify.sqlite,
        fastify.orchestrationStreamBroker,
        fastify.agentGatewayClient,
      ).catch((error) => {
        fastify.log.error(
          { err: error },
          'Failed to recover active orchestration sessions',
        );
      });
    });
  });
};

export default fp(orchestrationRuntimePlugin, {
  name: 'orchestration-runtime',
  dependencies: ['sqlite', 'orchestration-stream', 'agent-gateway-client'],
});
