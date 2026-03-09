import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { OrchestrationStreamBroker } from '../plugins/orchestration-stream';
import { createProject } from './project-service';
import { createOrchestrationSession, listOrchestrationSteps } from './orchestration-service';
import {
  createOrchestrationArtifact,
  getLatestArtifactByKind,
  listArtifactsBySession,
  listArtifactsByStep,
} from './orchestration-artifact-service';

describe('orchestration-artifact-service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates and queries artifacts by session, step, and kind', async () => {
    const sqlite = await createTestDatabase();
    const broker = new OrchestrationStreamBroker();
    const project = await createProject(sqlite, {
      title: 'Artifact Project',
      description: 'Persist orchestration artifacts',
    });
    const { session } = await createOrchestrationSession(sqlite, broker, {
      projectId: project.id,
      title: 'Store artifacts',
      goal: 'Persist prompt outputs',
    });
    const steps = await listOrchestrationSteps(sqlite, session.id);
    const planStep = steps[0];
    const implementStep = steps[1];

    const planArtifact = await createOrchestrationArtifact(sqlite, {
      sessionId: session.id,
      stepId: planStep.id,
      kind: 'plan',
      content: {
        summary: 'Plan work',
      },
    });
    const implementationArtifact = await createOrchestrationArtifact(sqlite, {
      sessionId: session.id,
      stepId: implementStep.id,
      kind: 'implementation',
      content: {
        summary: 'Implement work',
      },
    });

    await expect(listArtifactsBySession(sqlite, session.id)).resolves.toEqual([
      planArtifact,
      implementationArtifact,
    ]);
    await expect(listArtifactsByStep(sqlite, implementStep.id)).resolves.toEqual([
      implementationArtifact,
    ]);
    await expect(getLatestArtifactByKind(sqlite, session.id, 'plan')).resolves.toEqual(
      planArtifact,
    );
    await expect(
      getLatestArtifactByKind(sqlite, session.id, 'verification'),
    ).resolves.toBeNull();
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-artifact-'));
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
