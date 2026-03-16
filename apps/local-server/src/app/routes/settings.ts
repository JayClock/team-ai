import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentSettings } from '../presenters/settings-presenter';
import { getSettings, updateSettings } from '../services/settings-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const updateSettingsSchema = z.object({
  syncEnabled: z.boolean().optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
}).strict();

const settingsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/settings', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.settings);

    return presentSettings(await getSettings(fastify.sqlite));
  });

  fastify.patch('/settings', async (request, reply) => {
    const patch = updateSettingsSchema.parse(request.body);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.settings);

    return presentSettings(await updateSettings(fastify.sqlite, patch));
  });
};

export default settingsRoute;
