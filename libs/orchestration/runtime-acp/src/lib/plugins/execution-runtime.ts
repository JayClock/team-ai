import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

interface ExecutionRuntimeOptions {
  agentGatewayBaseUrl?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    agentGatewayBaseUrl: string | null;
  }
}

const executionRuntimePlugin: FastifyPluginAsync<ExecutionRuntimeOptions> = async (
  fastify,
  options,
) => {
  const agentGatewayBaseUrl =
    options.agentGatewayBaseUrl ?? process.env.AGENT_GATEWAY_BASE_URL ?? null;

  fastify.decorate('agentGatewayBaseUrl', agentGatewayBaseUrl);
};

export default fp(executionRuntimePlugin, {
  name: 'execution-runtime',
});
