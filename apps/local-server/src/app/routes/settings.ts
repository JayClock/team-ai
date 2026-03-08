import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentSettings } from '../presenters/settings-presenter';
import { getSettings, updateSettings } from '../services/settings-service';

const updateSettingsSchema = z.object({
  defaultModel: z.string().min(1).optional(),
  modelProvider: z.string().min(1).optional(),
  syncEnabled: z.boolean().optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
});

const settingsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/settings', async () =>
    presentSettings(await getSettings(fastify.sqlite)),
  );

  fastify.patch('/settings', async (request) => {
    const patch = updateSettingsSchema.parse(request.body);

    return presentSettings(await updateSettings(fastify.sqlite, patch));
  });
};

export default settingsRoute;
