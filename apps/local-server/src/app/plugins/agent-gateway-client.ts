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
  fastify.decorate(
    'agentGatewayClient',
    createAgentGatewayClient(
      options.agentGatewayBaseUrl ?? fastify.agentGatewayBaseUrl,
      options.fetchImpl,
    ),
  );
};

export default fp(agentGatewayClientPlugin, {
  name: 'agent-gateway-client',
  dependencies: ['execution-runtime'],
});
