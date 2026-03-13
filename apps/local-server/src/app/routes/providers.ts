import type { FastifyPluginAsync } from 'fastify';
import {
  presentProviderModels,
  presentProviders,
} from '../presenters/provider-presenter';
import {
  listProviderModels,
  listProviders,
} from '../services/provider-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const providersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/providers', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.providers);

    return presentProviders(await listProviders());
  });

  fastify.get('/providers/models', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.providerModels);

    return presentProviderModels(await listProviderModels());
  });
};

export default providersRoute;
