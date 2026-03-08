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

const conflictParamsSchema = z.object({
  conflictId: z.string().min(1),
});

const resolveConflictBodySchema = z.object({
  resolution: z.enum(['keep-local', 'keep-remote', 'mark-reviewed']),
});

const syncRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sync/status', async () =>
    presentSyncStatus(await getSyncStatus(fastify.sqlite)),
  );

  fastify.post('/sync/run', async () =>
    presentSyncStatus(await runSync(fastify.sqlite)),
  );

  fastify.post('/sync/pause', async () =>
    presentSyncStatus(await pauseSync(fastify.sqlite)),
  );

  fastify.post('/sync/resume', async () =>
    presentSyncStatus(await resumeSync(fastify.sqlite)),
  );

  fastify.get('/sync/conflicts', async () =>
    presentSyncConflicts(await listSyncConflicts(fastify.sqlite)),
  );

  fastify.post('/sync/conflicts/:conflictId/resolve', async (request) => {
    const { conflictId } = conflictParamsSchema.parse(request.params);
    const body = resolveConflictBodySchema.parse(request.body);

    return presentSyncConflict(
      await resolveSyncConflict(fastify.sqlite, conflictId, body.resolution),
    );
  });
};

export default syncRoute;
