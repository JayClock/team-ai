import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentProviderModels,
  presentProviders,
} from '../presenters/provider-presenter';
import {
  listProviderModels,
  listProviders,
  type ProviderModelCommandRunner,
} from '../services/provider-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const providerParamsSchema = z.object({
  providerId: z.string().trim().min(1),
});

interface ProvidersRouteOptions {
  providerModelCommandRunner?: ProviderModelCommandRunner;
}

const providersRoute: FastifyPluginAsync<ProvidersRouteOptions> = async (
  fastify,
  options,
) => {
  fastify.get('/providers', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.providers);

    return presentProviders(await listProviders());
  });

  fastify.get('/providers/:providerId/models', async (request, reply) => {
    const { providerId } = providerParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.providerModels);

    return presentProviderModels(
      providerId,
      await listProviderModels(providerId, {
        runCommand: options.providerModelCommandRunner,
      }),
    );
  });
};

export default providersRoute;
