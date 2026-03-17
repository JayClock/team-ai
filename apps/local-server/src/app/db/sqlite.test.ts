import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { sqliteMigrations } from './migrations';
import { initializeDatabase } from './sqlite';

describe('sqlite initialization', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  async function useTempDataDir(prefix: string): Promise<void> {
    const dataDir = await mkdtemp(join(tmpdir(), prefix));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;
    process.env.TEAMAI_DATA_DIR = dataDir;

    cleanupTasks.push(async () => {
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }

      await rm(dataDir, { recursive: true, force: true });
    });

    await mkdir(dataDir, { recursive: true });
  }

  it('creates the current schema snapshot on a fresh database', async () => {
    await useTempDataDir('team-ai-sqlite-schema-');

    const sqlite = initializeDatabase();

    const tables = sqlite
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `,
      )
      .all() as Array<{ name: string }>;
    const migrations = sqlite
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: string }>;
    const projectColumns = sqlite
      .prepare('PRAGMA table_info(projects)')
      .all() as Array<{ name: string }>;
    const settingsColumns = sqlite
      .prepare('PRAGMA table_info(settings)')
      .all() as Array<{ name: string }>;
    const acpSessionColumns = sqlite
      .prepare('PRAGMA table_info(project_acp_sessions)')
      .all() as Array<{ name: string }>;
    const agentColumns = sqlite
      .prepare('PRAGMA table_info(project_agents)')
      .all() as Array<{ name: string }>;
    const worktreeColumns = sqlite
      .prepare('PRAGMA table_info(project_worktrees)')
      .all() as Array<{ name: string }>;
    const taskColumns = sqlite
      .prepare('PRAGMA table_info(project_tasks)')
      .all() as Array<{ name: string }>;
    const runtimeProfileColumns = sqlite
      .prepare('PRAGMA table_info(project_runtime_profiles)')
      .all() as Array<{ name: string }>;
    const delegationGroupColumns = sqlite
      .prepare('PRAGMA table_info(project_delegation_groups)')
      .all() as Array<{ name: string }>;
    const workflowDefinitionColumns = sqlite
      .prepare('PRAGMA table_info(project_workflow_definitions)')
      .all() as Array<{ name: string }>;
    const workflowRunColumns = sqlite
      .prepare('PRAGMA table_info(project_workflow_runs)')
      .all() as Array<{ name: string }>;
    const scheduleColumns = sqlite
      .prepare('PRAGMA table_info(project_schedules)')
      .all() as Array<{ name: string }>;
    const worktreeIndexes = sqlite
      .prepare('PRAGMA index_list(project_worktrees)')
      .all() as Array<{ name: string }>;
    const taskIndexes = sqlite
      .prepare('PRAGMA index_list(project_tasks)')
      .all() as Array<{ name: string }>;
    const acpSessionIndexes = sqlite
      .prepare('PRAGMA index_list(project_acp_sessions)')
      .all() as Array<{ name: string }>;
    const delegationGroupIndexes = sqlite
      .prepare('PRAGMA index_list(project_delegation_groups)')
      .all() as Array<{ name: string }>;
    const workflowDefinitionIndexes = sqlite
      .prepare('PRAGMA index_list(project_workflow_definitions)')
      .all() as Array<{ name: string }>;
    const workflowRunIndexes = sqlite
      .prepare('PRAGMA index_list(project_workflow_runs)')
      .all() as Array<{ name: string }>;
    const scheduleIndexes = sqlite
      .prepare('PRAGMA index_list(project_schedules)')
      .all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual([
      'agents',
      'project_acp_session_events',
      'project_acp_sessions',
      'project_agents',
      'project_background_tasks',
      'project_codebases',
      'project_delegation_groups',
      'project_kanban_boards',
      'project_kanban_columns',
      'project_note_events',
      'project_notes',
      'project_runtime_profiles',
      'project_schedules',
      'project_task_runs',
      'project_tasks',
      'project_workflow_definitions',
      'project_workflow_runs',
      'project_worktrees',
      'projects',
      'schema_migrations',
      'settings',
      'sync_conflicts',
      'sync_state',
    ]);
    expect(migrations).toEqual(
      sqliteMigrations.map(({ version }) => ({ version })),
    );
    expect(projectColumns.map(({ name }) => name)).toEqual([
      'id',
      'title',
      'description',
      'created_at',
      'updated_at',
      'deleted_at',
      'workspace_root',
      'source_type',
      'source_url',
    ]);
    expect(settingsColumns.map(({ name }) => name)).toEqual([
      'id',
      'theme',
      'sync_enabled',
      'updated_at',
    ]);
    expect(acpSessionColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'actor_id',
      'parent_session_id',
      'name',
      'provider',
      'state',
      'runtime_session_id',
      'failure_reason',
      'last_event_id',
      'started_at',
      'last_activity_at',
      'completed_at',
      'created_at',
      'updated_at',
      'deleted_at',
      'cwd',
      'agent_id',
      'specialist_id',
      'task_id',
      'acp_status',
      'acp_error',
      'codebase_id',
      'worktree_id',
      'model',
    ]);
    expect(agentColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'name',
      'role',
      'provider',
      'model',
      'system_prompt',
      'created_at',
      'updated_at',
      'deleted_at',
      'parent_agent_id',
      'specialist_id',
    ]);
    expect(worktreeColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'codebase_id',
      'worktree_path',
      'branch',
      'base_branch',
      'status',
      'session_id',
      'label',
      'error_message',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    expect(taskColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'trigger_session_id',
      'title',
      'objective',
      'scope',
      'status',
      'board_id',
      'column_id',
      'position',
      'priority',
      'labels_json',
      'assignee',
      'assigned_provider',
      'assigned_role',
      'assigned_specialist_id',
      'assigned_specialist_name',
      'dependencies_json',
      'parallel_group',
      'acceptance_criteria_json',
      'verification_commands_json',
      'completion_summary',
      'verification_verdict',
      'verification_report',
      'github_id',
      'github_number',
      'github_url',
      'github_repo',
      'github_state',
      'github_synced_at',
      'last_sync_error',
      'created_at',
      'updated_at',
      'deleted_at',
      'kind',
      'parent_task_id',
      'execution_session_id',
      'result_session_id',
      'source_type',
      'source_event_id',
      'source_entry_index',
      'session_id',
      'codebase_id',
      'worktree_id',
      'workspace_id',
      'session_ids_json',
      'lane_sessions_json',
      'lane_handoffs_json',
      'codebase_ids_json',
    ]);
    expect(runtimeProfileColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'default_provider_id',
      'default_model',
      'orchestration_mode',
      'enabled_skill_ids_json',
      'enabled_mcp_server_ids_json',
      'created_at',
      'updated_at',
      'deleted_at',
      'skill_configs_json',
      'mcp_server_configs_json',
    ]);
    expect(delegationGroupColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'caller_session_id',
      'status',
      'completed_at',
      'created_at',
      'updated_at',
      'parent_session_id',
      'task_ids_json',
      'session_ids_json',
      'failure_reason',
    ]);
    expect(workflowDefinitionColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'name',
      'description',
      'version',
      'steps_json',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    expect(workflowRunColumns.map(({ name }) => name)).toEqual([
      'id',
      'workflow_id',
      'project_id',
      'workflow_name',
      'workflow_version',
      'status',
      'trigger_source',
      'trigger_payload',
      'current_step_name',
      'total_steps',
      'started_at',
      'completed_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    expect(scheduleColumns.map(({ name }) => name)).toEqual([
      'id',
      'project_id',
      'workflow_id',
      'name',
      'cron_expr',
      'trigger_target',
      'trigger_payload_template',
      'enabled',
      'last_run_at',
      'next_run_at',
      'last_workflow_run_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
    expect(worktreeIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'idx_project_worktrees_project_id',
        'idx_project_worktrees_codebase_id',
        'idx_project_worktrees_session_id',
        'idx_project_worktrees_codebase_branch_active',
        'idx_project_worktrees_path_active',
      ]),
    );
    expect(taskIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'idx_project_tasks_codebase_id',
        'idx_project_tasks_worktree_id',
        'idx_project_tasks_workspace_id',
      ]),
    );
    expect(acpSessionIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'idx_project_acp_sessions_codebase_id',
        'idx_project_acp_sessions_worktree_id',
      ]),
    );
    expect(delegationGroupIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'idx_project_delegation_groups_project_id',
        'idx_project_delegation_groups_caller_session_id',
        'idx_project_delegation_groups_open_caller',
      ]),
    );
    expect(workflowDefinitionIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'idx_project_workflow_definitions_project_id',
        'idx_project_workflow_definitions_project_name',
      ]),
    );
    expect(workflowRunIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'idx_project_workflow_runs_workflow_id',
        'idx_project_workflow_runs_project_id',
      ]),
    );
    expect(scheduleIndexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'idx_project_schedules_project_id',
        'idx_project_schedules_due',
      ]),
    );

    sqlite.close();
  });

  it('seeds default settings for a fresh database', async () => {
    await useTempDataDir('team-ai-sqlite-settings-');

    const sqlite = initializeDatabase();
    const settings = sqlite
      .prepare(
        `
          SELECT theme, sync_enabled
          FROM settings
          WHERE id = 1
        `,
      )
      .get() as {
      sync_enabled: number;
      theme: string;
    };

    expect(settings).toEqual({
      sync_enabled: 0,
      theme: 'system',
    });

    sqlite.close();
  });

  it('reopens an existing database without duplicating migrations or seed rows', async () => {
    await useTempDataDir('team-ai-sqlite-reopen-');

    const first = initializeDatabase();
    first.close();

    const second = initializeDatabase();
    const migrationCount = second
      .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
      .get() as { count: number };
    const settingsCount = second
      .prepare('SELECT COUNT(*) AS count FROM settings')
      .get() as { count: number };

    expect(migrationCount).toEqual({ count: sqliteMigrations.length });
    expect(settingsCount).toEqual({ count: 1 });

    second.close();
  });
});
