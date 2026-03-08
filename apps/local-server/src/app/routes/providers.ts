import type { FastifyPluginAsync } from 'fastify';
import {
  presentProviderModels,
  presentProviders,
} from '../presenters/provider-presenter';
import {
  listProviderModels,
  listProviders,
} from '../services/provider-service';

const providersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/providers', async () => presentProviders(await listProviders()));

  fastify.get('/providers/models', async () =>
    presentProviderModels(await listProviderModels()),
  );
};

export default providersRoute;
