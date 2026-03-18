import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeDatabase } from '../db/sqlite';
import { createProject } from './project-service';
import { getSpecialistById, listSpecialists } from './specialist-service';

describe('specialist service', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('loads built-in and workspace specialists with workspace precedence', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-specialist-workspace-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'crafter-implementor.md'),
      [
        '---',
        'id: crafter-implementor',
        'name: Workspace Crafter',
        'role: CRAFTER',
        'description: Workspace override',
        'modelTier: premium',
        '---',
        'Use the workspace-specific implementation prompt.',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(sqlite, {
      repoPath,
      title: 'Workspace',
    });

    const payload = await listSpecialists(sqlite, {
      projectId: project.id,
    });
    const crafter = payload.items.find(
      (specialist) => specialist.id === 'crafter-implementor',
    );

    expect(payload.items.map((specialist) => specialist.id)).toEqual(
      expect.arrayContaining([
        'routa-coordinator',
        'crafter-implementor',
        'gate-reviewer',
        'solo-developer',
      ]),
    );
    expect(crafter).toMatchObject({
      modelTier: 'premium',
      name: 'Workspace Crafter',
      source: {
        scope: 'workspace',
      },
    });
  });

  it('loads user specialists from the data directory', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-user-project',
      title: 'User Specialists',
    });
    const specialistsDir = join(
      process.env.TEAMAI_DATA_DIR as string,
      'specialists',
    );

    await mkdir(specialistsDir, {
      recursive: true,
    });
    await writeFile(
      join(specialistsDir, 'frontend-architect.json'),
      JSON.stringify({
        description: 'Custom frontend specialist',
        id: 'frontend-architect',
        modelTier: 'premium',
        name: 'Frontend Architect',
        role: 'CRAFTER',
        systemPrompt: 'Focus on frontend architecture.',
      }),
      'utf8',
    );

    const specialist = await getSpecialistById(
      sqlite,
      project.id,
      'frontend-architect',
    );

    expect(specialist).toMatchObject({
      id: 'frontend-architect',
      role: 'CRAFTER',
      source: {
        scope: 'user',
      },
    });
  });

  it('resolves built-in alias ids used by routa-style flows', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-alias-project',
      title: 'Alias Specialists',
    });

    const specialist = await getSpecialistById(sqlite, project.id, 'developer');

    expect(specialist).toMatchObject({
      id: 'solo-developer',
      role: 'DEVELOPER',
    });
  });

  it('loads shared library specialists before workspace overrides', async () => {
    const sqlite = await createTestDatabase();
    const repoPath = await mkdtemp(
      join(tmpdir(), 'team-ai-specialist-library-workspace-'),
    );
    cleanupTasks.push(async () => {
      await rm(repoPath, { recursive: true, force: true });
    });

    const libraryDir = join(
      process.env.TEAMAI_DATA_DIR as string,
      'libraries',
      'shared-ops',
      'specialists',
    );
    await mkdir(libraryDir, {
      recursive: true,
    });
    await writeFile(
      join(libraryDir, 'routa-coordinator.md'),
      [
        '---',
        'id: routa-coordinator',
        'name: Shared Routa',
        'role: ROUTA',
        'description: Shared library override',
        '---',
        'Use the shared routing prompt.',
      ].join('\n'),
      'utf8',
    );

    const project = await createProject(sqlite, {
      repoPath,
      title: 'Library Specialists',
    });

    const librarySpecialist = await getSpecialistById(
      sqlite,
      project.id,
      'routa-coordinator',
    );

    expect(librarySpecialist).toMatchObject({
      name: 'Shared Routa',
      source: {
        libraryId: 'shared-ops',
        scope: 'library',
      },
    });

    await mkdir(join(repoPath, 'resources', 'specialists'), {
      recursive: true,
    });
    await writeFile(
      join(repoPath, 'resources', 'specialists', 'routa-coordinator.md'),
      [
        '---',
        'id: routa-coordinator',
        'name: Workspace Routa',
        'role: ROUTA',
        'description: Workspace override wins',
        '---',
        'Use the workspace routing prompt.',
      ].join('\n'),
      'utf8',
    );

    const workspaceSpecialist = await getSpecialistById(
      sqlite,
      project.id,
      'routa-coordinator',
    );

    expect(workspaceSpecialist).toMatchObject({
      name: 'Workspace Routa',
      source: {
        scope: 'workspace',
      },
    });
  });

  it('keeps the built-in coordinator prompt focused on planning and dispatch', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-routa-project',
      title: 'Routa Prompt',
    });

    const specialist = await getSpecialistById(
      sqlite,
      project.id,
      'routa-coordinator',
    );

    expect(specialist.systemPrompt).toContain(
      'canonical spec as the source of truth',
    );
    expect(specialist.systemPrompt).toContain(
      '`set_note_content`',
    );
    expect(specialist.systemPrompt).toContain('`@@@task` blocks');
    expect(specialist.systemPrompt).toContain(
      'Do not take on large implementation, review, or verification work',
    );
    expect(specialist.systemPrompt).toContain('`delegate_task_to_agent`');
    expect(specialist.systemPrompt).toContain('`notes_append`');
    expect(specialist.systemPrompt).toContain('`list_notes`');
    expect(specialist.systemPrompt).toContain('`read_note`');
    expect(specialist.systemPrompt).toContain('`read_agent_conversation`');
    expect(specialist.systemPrompt).toContain('get approval');
    expect(specialist.systemPrompt).toContain('After each delegation or reporting wave');
    expect(specialist.systemPrompt).not.toContain('`acp_session_create`');
  });

  it('keeps the built-in implementor prompt scoped and report-oriented', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-crafter-project',
      title: 'Crafter Prompt',
    });

    const specialist = await getSpecialistById(
      sqlite,
      project.id,
      'crafter-implementor',
    );

    expect(specialist.systemPrompt).toContain('single assigned task');
    expect(specialist.systemPrompt).toContain('Do not expand scope on your own');
    expect(specialist.systemPrompt).toContain('`report_to_parent`');
    expect(specialist.systemPrompt).toContain('Change scope:');
    expect(specialist.systemPrompt).toContain('Verification:');
    expect(specialist.systemPrompt).toContain('Blocker:');
    expect(specialist.systemPrompt).toContain('Summary:');
    expect(specialist.systemPrompt).toContain('Residual risk:');
  });

  it('keeps the built-in reviewer prompt focused on acceptance verification', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-gate-project',
      title: 'Gate Prompt',
    });

    const specialist = await getSpecialistById(
      sqlite,
      project.id,
      'gate-reviewer',
    );

    expect(specialist.systemPrompt).toContain(
      'primary responsibility is review and verification',
    );
    expect(specialist.systemPrompt).toContain(
      'Acceptance criteria are the approval contract',
    );
    expect(specialist.systemPrompt).toContain(
      'Do not directly replace the implementor',
    );
    expect(specialist.systemPrompt).toContain('`report_to_parent`');
    expect(specialist.systemPrompt).toContain('Verdict:');
    expect(specialist.systemPrompt).toContain('Failure reason:');
    expect(specialist.systemPrompt).toContain('Evidence summary:');
  });

  it('keeps the built-in solo developer prompt in single-agent mode', async () => {
    const sqlite = await createTestDatabase();
    const project = await createProject(sqlite, {
      repoPath: '/tmp/team-ai-specialist-solo-project',
      title: 'Solo Prompt',
    });

    const specialist = await getSpecialistById(
      sqlite,
      project.id,
      'solo-developer',
    );

    expect(specialist.systemPrompt).toContain(
      'Operate as the single worker for DEVELOPER orchestration mode',
    );
    expect(specialist.systemPrompt).toContain('Unlike ROUTA');
    expect(specialist.systemPrompt).toContain(
      'Child-session dispatch is off by default in solo mode',
    );
    expect(specialist.systemPrompt).toContain('`acp_session_create` MCP tool');
    expect(specialist.systemPrompt).toContain(
      'Do not assume the system will auto-dispatch them',
    );
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(
      join(tmpdir(), 'team-ai-specialist-service-'),
    );
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
