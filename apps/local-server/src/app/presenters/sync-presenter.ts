import type {
  SyncConflictListPayload,
  SyncConflictPayload,
  SyncStatusPayload,
} from '../schemas/sync';

export function presentSyncStatus(status: SyncStatusPayload) {
  return {
    _links: {
      self: {
        href: '/api/sync/status',
      },
      run: {
        href: '/api/sync/run',
      },
      pause: {
        href: '/api/sync/pause',
      },
      resume: {
        href: '/api/sync/resume',
      },
      conflicts: {
        href: '/api/sync/conflicts',
      },
    },
    ...status,
  };
}

export function presentSyncConflicts(payload: SyncConflictListPayload) {
  return {
    _links: {
      self: {
        href: '/api/sync/conflicts',
      },
      status: {
        href: '/api/sync/status',
      },
    },
    _embedded: {
      conflicts: payload.items.map((conflict) => presentSyncConflict(conflict)),
    },
    total: payload.total,
  };
}

export function presentSyncConflict(conflict: SyncConflictPayload) {
  return {
    _links: {
      self: {
        href: `/api/sync/conflicts/${conflict.id}`,
      },
      resolve: {
        href: `/api/sync/conflicts/${conflict.id}/resolve`,
      },
      status: {
        href: '/api/sync/status',
      },
    },
    ...conflict,
  };
}
