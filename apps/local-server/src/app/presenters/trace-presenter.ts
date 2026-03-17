import type {
  TraceListPayload,
  TracePayload,
  TraceStatsPayload,
} from '../schemas/trace';

function createTraceLinks(trace: TracePayload) {
  return {
    collection: {
      href: '/api/traces',
    },
    project: {
      href: `/api/projects/${trace.projectId}`,
    },
    self: {
      href: `/api/traces/${trace.id}`,
    },
    session: {
      href: `/api/projects/${trace.projectId}/acp-sessions/${trace.sessionId}`,
    },
  };
}

function presentTraceResource(trace: TracePayload) {
  return {
    _links: createTraceLinks(trace),
    ...trace,
  };
}

export function presentTrace(trace: TracePayload) {
  return presentTraceResource(trace);
}

export function presentTraceList(payload: TraceListPayload) {
  const query = new URLSearchParams({
    limit: String(payload.limit),
    offset: String(payload.offset),
  });

  if (payload.projectId) {
    query.set('projectId', payload.projectId);
  }

  if (payload.sessionId) {
    query.set('sessionId', payload.sessionId);
  }

  if (payload.eventType) {
    query.set('eventType', payload.eventType);
  }

  return {
    _embedded: {
      traces: payload.items.map(presentTraceResource),
    },
    _links: {
      self: {
        href: `/api/traces?${query.toString()}`,
      },
    },
    limit: payload.limit,
    offset: payload.offset,
    total: payload.total,
  };
}

export function presentTraceStats(stats: TraceStatsPayload) {
  const query = new URLSearchParams();
  if (stats.projectId) {
    query.set('projectId', stats.projectId);
  }
  if (stats.sessionId) {
    query.set('sessionId', stats.sessionId);
  }

  return {
    _links: {
      self: {
        href: query.size > 0
          ? `/api/traces/stats?${query.toString()}`
          : '/api/traces/stats',
      },
    },
    ...stats,
  };
}
