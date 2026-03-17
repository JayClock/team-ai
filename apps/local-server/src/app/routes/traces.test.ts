import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import problemJsonPlugin from '../plugins/problem-json';
import { createProject } from '../services/project-service';
import { recordAcpTrace } from '../services/trace-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import tracesRoute from './traces';

describe('traces route', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('lists trace resources, trace details, and trace stats', async () => {
    const sqlite = await createTestDatabase();
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);

    await fastify.register(problemJsonPlugin);
    await fastify.register(tracesRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-traces-route',
      title: 'Traces Route',
    });
    insertAcpSession(sqlite, {
      id: 'acps_trace_route_1',
      name: 'Trace Route Session',
      projectId: project.id,
    });
    recordAcpTrace(sqlite, {
      createdAt: '2026-03-17T00:00:00.000Z',
      eventId: 'evt_trace_route_1',
      sessionId: 'acps_trace_route_1',
      update: {
        eventType: 'tool_call',
        provider: 'codex',
        sessionId: 'acps_trace_route_1',
        timestamp: '2026-03-17T00:00:00.000Z',
        toolCall: {
          content: [],
          inputFinalized: true,
          locations: [],
          output: null,
          status: 'completed',
          title: 'read_file',
        },
      },
    });

    const listResponse = await fastify.inject({
      method: 'GET',
      url: `/api/traces?projectId=${project.id}`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(responseContentType(listResponse)).toBe(VENDOR_MEDIA_TYPES.traces);
    expect(listResponse.json()).toMatchObject({
      _embedded: {
        traces: [
          expect.objectContaining({
            eventType: 'tool_call',
            id: 'evt_trace_route_1',
          }),
        ],
      },
      total: 1,
    });

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: '/api/traces/evt_trace_route_1',
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(responseContentType(detailResponse)).toBe(VENDOR_MEDIA_TYPES.trace);
    expect(detailResponse.json()).toMatchObject({
      eventId: 'evt_trace_route_1',
      eventType: 'tool_call',
      id: 'evt_trace_route_1',
    });

    const statsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/traces/stats?projectId=${project.id}`,
    });

    expect(statsResponse.statusCode).toBe(200);
    expect(responseContentType(statsResponse)).toBe(
      VENDOR_MEDIA_TYPES.traceStats,
    );
    expect(statsResponse.json()).toMatchObject({
      byEventType: {
        tool_call: 1,
      },
      total: 1,
      uniqueSessions: 1,
    });
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-traces-route-'));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;

    process.env.TEAMAI_DATA_DIR = dataDir;
    const sqlite = initializeDatabase();

    cleanupTasks.push(async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { recursive: true, force: true });
    });

    return sqlite;
  }
});
