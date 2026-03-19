import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentTrace,
  presentTraceList,
  presentTraceStats,
} from '../presenters/trace-presenter';
import {
  getTraceById,
  getTraceStats,
  listTraces,
} from '../services/trace-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const traceEventTypeValues = [
  'tool_call',
  'tool_call_update',
  'agent_message',
  'agent_thought',
  'user_message',
  'terminal_created',
  'terminal_output',
  'terminal_exited',
  'plan_update',
  'turn_complete',
  'session_info_update',
  'current_mode_update',
  'config_option_update',
  'usage_update',
  'available_commands_update',
  'orchestration_update',
  'lifecycle_update',
  'supervision_update',
  'error',
] as const;

const listTracesQuerySchema = z.object({
  eventType: z.enum(traceEventTypeValues).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
});

const traceParamsSchema = z.object({
  traceId: z.string().min(1),
});

const traceStatsQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
});

const tracesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/traces/stats', async (request, reply) => {
    const query = traceStatsQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.traceStats);

    return presentTraceStats(await getTraceStats(fastify.sqlite, query));
  });

  fastify.get('/traces', async (request, reply) => {
    const query = listTracesQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.traces);

    return presentTraceList(await listTraces(fastify.sqlite, query));
  });

  fastify.get('/traces/:traceId', async (request, reply) => {
    const { traceId } = traceParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.trace);

    return presentTrace(getTraceById(fastify.sqlite, traceId));
  });
};

export default tracesRoute;
