import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  createAgentGatewayClient,
  type AgentGatewayClient,
} from '../clients/agent-gateway-client';

interface AgentGatewayClientOptions {
  agentGatewayBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

declare module 'fastify' {
  interface FastifyInstance {
    agentGatewayClient: AgentGatewayClient;
  }
}

const agentGatewayClientPlugin: FastifyPluginAsync<AgentGatewayClientOptions> = async (
  fastify,
  options,
) => {
  const client = createAgentGatewayClient(
    options.agentGatewayBaseUrl ?? fastify.agentGatewayBaseUrl,
    options.fetchImpl,
  );

  fastify.decorate('agentGatewayClient', client);

  if (client.isConfigured()) {
    await client.refreshProviderCatalog({ includeRegistry: true }).catch(() => {
      fastify.log.debug(
        'agent-gateway provider catalog warmup failed; continuing with lazy cache population',
      );
    });
  }
};

export default fp(agentGatewayClientPlugin, {
  name: 'agent-gateway-client',
  dependencies: ['execution-runtime'],
});
