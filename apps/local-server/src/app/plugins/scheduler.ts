import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { SchedulerService } from '../services/scheduler-service';
import { createSchedulerService } from '../services/scheduler-service';
import { tickDueSchedules } from '../services/schedule-service';

declare module 'fastify' {
  interface FastifyInstance {
    schedulerService: SchedulerService;
  }
}

interface SchedulerPluginOptions {
  enabled?: boolean;
  intervalMs?: number;
}

const schedulerPlugin: FastifyPluginAsync<SchedulerPluginOptions> = async (
  fastify,
  options,
) => {
  const schedulerService = createSchedulerService({
    intervalMs: options.intervalMs,
    logger: fastify.log,
    tick: async () => tickDueSchedules(fastify.sqlite),
  });

  fastify.decorate('schedulerService', schedulerService);

  if (options.enabled !== false) {
    fastify.addHook('onReady', async () => {
      schedulerService.start();
    });
  }

  fastify.addHook('onClose', async () => {
    schedulerService.stop();
  });
};

export default fp(schedulerPlugin, {
  name: 'scheduler',
  dependencies: ['sqlite'],
});
