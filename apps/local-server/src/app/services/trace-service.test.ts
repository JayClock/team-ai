import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import { createProject } from './project-service';
import {
  getTraceById,
  getTraceStats,
  listTraces,
  recordAcpTrace,
} from './trace-service';

describe('trace service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('records ACP traces and lists them with stats', async () => {
    const sqlite = await createTestDatabase(cleanupTasks);
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-trace-service',
      title: 'Trace Service',
    });
    insertAcpSession(sqlite, {
      id: 'acps_trace_service_1',
      name: 'Trace Session',
      projectId: project.id,
    });

    const trace = recordAcpTrace(sqlite, {
      createdAt: '2026-03-17T00:00:00.000Z',
      eventId: 'evt_trace_1',
      sessionId: 'acps_trace_service_1',
      update: {
        eventType: 'agent_message',
        message: {
          content: 'Trace me through the routing layer',
          role: 'assistant',
        },
        provider: 'codex',
        sessionId: 'acps_trace_service_1',
        timestamp: '2026-03-17T00:00:00.000Z',
      },
    });

    expect(trace).toMatchObject({
      eventId: 'evt_trace_1',
      eventType: 'agent_message',
      projectId: project.id,
      provider: 'codex',
      sessionId: 'acps_trace_service_1',
    });
    expect(trace?.summary).toContain('assistant: Trace me through the routing layer');

    const listed = await listTraces(sqlite, { projectId: project.id });
    expect(listed).toMatchObject({
      projectId: project.id,
      total: 1,
    });
    expect(listed.items[0]).toMatchObject({
      id: 'evt_trace_1',
    });

    expect(getTraceById(sqlite, 'evt_trace_1')).toMatchObject({
      id: 'evt_trace_1',
    });

    const stats = await getTraceStats(sqlite, { projectId: project.id });
    expect(stats).toEqual({
      byEventType: {
        agent_message: 1,
      },
      projectId: project.id,
      sessionId: null,
      total: 1,
      uniqueSessions: 1,
    });
  });
});

async function createTestDatabase(cleanupTasks: Array<() => Promise<void>>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-trace-service-'));
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
