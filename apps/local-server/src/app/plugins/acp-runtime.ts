import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  createAcpRuntimeClient,
  type AcpRuntimeClient,
} from '../clients/acp-runtime-client';

interface AcpRuntimePluginOptions {
  acpRuntime?: AcpRuntimeClient;
}

declare module 'fastify' {
  interface FastifyInstance {
    acpRuntime: AcpRuntimeClient;
  }
}

const acpRuntimePlugin: FastifyPluginAsync<AcpRuntimePluginOptions> = async (
  fastify,
  options,
) => {
  const acpRuntime =
    options.acpRuntime ??
    createAcpRuntimeClient({
      logger: fastify.log,
    });

  fastify.decorate('acpRuntime', acpRuntime);
  fastify.addHook('onClose', async () => {
    await acpRuntime.close();
  });
};

export default fp(acpRuntimePlugin, {
  name: 'acp-runtime',
});
