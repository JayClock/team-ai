import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentSchedule,
  presentScheduleList,
} from '../presenters/schedule-presenter';
import {
  createSchedule,
  getScheduleById,
  listProjectSchedules,
  tickDueSchedules,
} from '../services/schedule-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const scheduleParamsSchema = z.object({
  scheduleId: z.string().min(1),
});

const createScheduleBodySchema = z.object({
  cronExpr: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1),
  triggerPayloadTemplate: z.union([z.string().trim().min(1), z.null()]).optional(),
  workflowId: z.string().trim().min(1),
});

const schedulesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:projectId/schedules', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.schedules);

    return presentScheduleList(
      await listProjectSchedules(fastify.sqlite, projectId),
    );
  });

  fastify.post('/projects/:projectId/schedules', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = createScheduleBodySchema.parse(request.body);
    const schedule = await createSchedule(fastify.sqlite, {
      ...body,
      projectId,
    });

    reply
      .code(201)
      .header('Location', `/api/schedules/${schedule.id}`)
      .type(VENDOR_MEDIA_TYPES.schedule);
    return presentSchedule(schedule);
  });

  fastify.get('/schedules/:scheduleId', async (request, reply) => {
    const { scheduleId } = scheduleParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.schedule);

    return presentSchedule(await getScheduleById(fastify.sqlite, scheduleId));
  });

  fastify.post('/schedules/tick', async (_request, reply) => {
    const result = await tickDueSchedules(fastify.sqlite);

    reply.code(200);
    return result;
  });
};

export default schedulesRoute;
