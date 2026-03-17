import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { initializeDatabase } from '../../db/sqlite';
import { insertAcpSession } from '../../test-support/acp-session-fixture';
import { createProject } from '../../services/project-service';
import { createApplyFlowTemplateHandler } from './note-handlers';

describe('createApplyFlowTemplateHandler', () => {
  it('creates or updates the canonical session-scoped spec note without materializing tasks', async () => {
    const { cleanup, sqlite } = await createTestDatabase();

    try {
      const project = await createProject(sqlite, {
        repoPath: '/tmp/team-ai-apply-flow-template-project',
        title: 'Apply Flow Template Project',
      });
      const sessionId = 'acps_specscope01';
      insertAcpSession(sqlite, {
        id: sessionId,
        name: 'Spec-first session',
        projectId: project.id,
      });

      const applyFlowTemplate = createApplyFlowTemplateHandler(
        { sqlite } as FastifyInstance,
      );

      const firstResult = await applyFlowTemplate({
        projectId: project.id,
        sessionId,
        templateId: 'routa-spec-loop',
        variables: {
          projectTitle: project.title,
        },
      });

      expect(firstResult.note).toMatchObject({
        projectId: project.id,
        sessionId,
        type: 'spec',
      });
      expect(firstResult.taskSync).toMatchObject({
        createdCount: 0,
        parsedCount: 0,
        skipped: true,
      });

      const secondResult = await applyFlowTemplate({
        projectId: project.id,
        sessionId,
        templateId: 'routa-spec-loop',
        title: 'Session Loop Spec',
        variables: {
          projectTitle: 'Updated Project Title',
        },
      });

      expect(secondResult.note).toMatchObject({
        id: firstResult.note.id,
        sessionId,
        title: 'Session Loop Spec',
        type: 'spec',
      });
      expect(secondResult.taskSync).toMatchObject({
        createdCount: 0,
        parsedCount: 0,
        skipped: true,
        updatedCount: 0,
      });
    } finally {
      await cleanup();
    }
  });
});

async function createTestDatabase(): Promise<{
  cleanup: () => Promise<void>;
  sqlite: Database;
}> {
  const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-note-handlers-'));
  const previousDataDir = process.env.TEAMAI_DATA_DIR;

  process.env.TEAMAI_DATA_DIR = dataDir;
  const sqlite = initializeDatabase();

  return {
    cleanup: async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { force: true, recursive: true });
    },
    sqlite,
  };
}
