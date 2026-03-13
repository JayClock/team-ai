import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentSyncConflict,
  presentSyncConflicts,
  presentSyncStatus,
} from '../presenters/sync-presenter';
import {
  getSyncStatus,
  listSyncConflicts,
  pauseSync,
  resolveSyncConflict,
  resumeSync,
  runSync,
} from '../services/sync-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const conflictParamsSchema = z.object({
  conflictId: z.string().min(1),
});

const resolveConflictBodySchema = z.object({
  resolution: z.enum(['keep-local', 'keep-remote', 'mark-reviewed']),
});

const syncRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sync/status', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.syncStatus);

    return presentSyncStatus(await getSyncStatus(fastify.sqlite));
  });

  fastify.post('/sync/run', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.syncStatus);

    return presentSyncStatus(await runSync(fastify.sqlite));
  });

  fastify.post('/sync/pause', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.syncStatus);

    return presentSyncStatus(await pauseSync(fastify.sqlite));
  });

  fastify.post('/sync/resume', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.syncStatus);

    return presentSyncStatus(await resumeSync(fastify.sqlite));
  });

  fastify.get('/sync/conflicts', async (_request, reply) => {
    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.syncConflicts);

    return presentSyncConflicts(await listSyncConflicts(fastify.sqlite));
  });

  fastify.post(
    '/sync/conflicts/:conflictId/resolve',
    async (request, reply) => {
      const { conflictId } = conflictParamsSchema.parse(request.params);
      const body = resolveConflictBodySchema.parse(request.body);

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.syncConflict);

      return presentSyncConflict(
        await resolveSyncConflict(fastify.sqlite, conflictId, body.resolution),
      );
    },
  );
};

export default syncRoute;
