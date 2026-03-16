export interface SqliteMigration {
  sql: string;
  version: string;
}

export const sqliteMigrations: SqliteMigration[] = [
  {
    version: '001_settings',
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        default_model TEXT NOT NULL,
        sync_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: '002_projects',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        workspace_root TEXT,
        source_type TEXT,
        source_url TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_workspace_root_active
        ON projects(workspace_root)
        WHERE workspace_root IS NOT NULL AND deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_source_url_active
        ON projects(source_url)
        WHERE source_url IS NOT NULL AND deleted_at IS NULL;
    `,
  },
  {
    version: '003_agents',
    sql: `
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `,
  },
  {
    version: '004_sync_state',
    sql: `
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        paused INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT,
        last_successful_sync_at TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: '005_sync_conflicts',
    sql: `
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        title TEXT NOT NULL,
        local_summary TEXT NOT NULL,
        remote_summary TEXT NOT NULL,
        status TEXT NOT NULL,
        resolution TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status
        ON sync_conflicts(status, updated_at);
    `,
  },
  {
    version: '006_project_acp_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS project_acp_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        parent_session_id TEXT,
        name TEXT,
        provider TEXT NOT NULL,
        state TEXT NOT NULL,
        runtime_session_id TEXT,
        failure_reason TEXT,
        last_event_id TEXT,
        started_at TEXT,
        last_activity_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        cwd TEXT,
        agent_id TEXT,
        specialist_id TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (parent_session_id) REFERENCES project_acp_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_acp_sessions_project_id
        ON project_acp_sessions(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_acp_sessions_agent_id
        ON project_acp_sessions(agent_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '007_project_acp_session_events',
    sql: `
      CREATE TABLE IF NOT EXISTS project_acp_session_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        error_json TEXT,
        emitted_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES project_acp_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_acp_session_events_session_id
        ON project_acp_session_events(session_id, sequence ASC);
    `,
  },
  {
    version: '008_project_agents',
    sql: `
      CREATE TABLE IF NOT EXISTS project_agents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        parent_agent_id TEXT,
        specialist_id TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_agents_project_id
        ON project_agents(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_agents_parent_agent_id
        ON project_agents(parent_agent_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_agents_specialist_id
        ON project_agents(specialist_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '009_project_tasks',
    sql: `
      CREATE TABLE IF NOT EXISTS project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        trigger_session_id TEXT,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        scope TEXT,
        status TEXT NOT NULL,
        board_id TEXT,
        column_id TEXT,
        position INTEGER,
        priority TEXT,
        labels_json TEXT NOT NULL DEFAULT '[]',
        assignee TEXT,
        assigned_provider TEXT,
        assigned_role TEXT,
        assigned_specialist_id TEXT,
        assigned_specialist_name TEXT,
        dependencies_json TEXT NOT NULL DEFAULT '[]',
        parallel_group TEXT,
        acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
        verification_commands_json TEXT NOT NULL DEFAULT '[]',
        completion_summary TEXT,
        verification_verdict TEXT,
        verification_report TEXT,
        github_id TEXT,
        github_number INTEGER,
        github_url TEXT,
        github_repo TEXT,
        github_state TEXT,
        github_synced_at TEXT,
        last_sync_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (trigger_session_id) REFERENCES project_acp_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id
        ON project_tasks(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_trigger_session_id
        ON project_tasks(trigger_session_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_status
        ON project_tasks(status, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '010_project_tasks_task_id',
    sql: `
      ALTER TABLE project_acp_sessions
        ADD COLUMN task_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_project_acp_sessions_task_id
        ON project_acp_sessions(task_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      ALTER TABLE project_tasks
        ADD COLUMN kind TEXT;

      ALTER TABLE project_tasks
        ADD COLUMN parent_task_id TEXT;

      ALTER TABLE project_tasks
        ADD COLUMN execution_session_id TEXT;

      ALTER TABLE project_tasks
        ADD COLUMN result_session_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_parent_task_id
        ON project_tasks(parent_task_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_execution_session_id
        ON project_tasks(execution_session_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '011_project_tasks_source_tracking',
    sql: `
      ALTER TABLE project_tasks
        ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';

      ALTER TABLE project_tasks
        ADD COLUMN source_event_id TEXT;

      ALTER TABLE project_tasks
        ADD COLUMN source_entry_index INTEGER;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_source_type
        ON project_tasks(source_type, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tasks_acp_plan_source
        ON project_tasks(source_event_id, source_entry_index)
        WHERE source_type = 'acp_plan' AND deleted_at IS NULL;
    `,
  },
  {
    version: '012_project_notes',
    sql: `
      CREATE TABLE IF NOT EXISTS project_notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        format TEXT NOT NULL DEFAULT 'markdown',
        parent_note_id TEXT,
        linked_task_id TEXT,
        assigned_agent_ids_json TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (session_id) REFERENCES project_acp_sessions(id),
        FOREIGN KEY (linked_task_id) REFERENCES project_tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_notes_project_id
        ON project_notes(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_notes_session_id
        ON project_notes(session_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_notes_type
        ON project_notes(type, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_notes_parent_note_id
        ON project_notes(parent_note_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '013_project_note_events',
    sql: `
      CREATE TABLE IF NOT EXISTS project_note_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        emitted_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (note_id) REFERENCES project_notes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_note_events_project_id
        ON project_note_events(project_id, sequence ASC);

      CREATE INDEX IF NOT EXISTS idx_project_note_events_note_id
        ON project_note_events(note_id, sequence ASC);

      CREATE INDEX IF NOT EXISTS idx_project_note_events_session_id
        ON project_note_events(session_id, sequence ASC);
    `,
  },
  {
    version: '014_project_task_runs',
    sql: `
      CREATE TABLE IF NOT EXISTS project_task_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        session_id TEXT,
        kind TEXT NOT NULL,
        role TEXT,
        provider TEXT,
        specialist_id TEXT,
        status TEXT NOT NULL,
        summary TEXT,
        verification_verdict TEXT,
        verification_report TEXT,
        retry_of_run_id TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (task_id) REFERENCES project_tasks(id),
        FOREIGN KEY (session_id) REFERENCES project_acp_sessions(id),
        FOREIGN KEY (retry_of_run_id) REFERENCES project_task_runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_task_runs_project_id
        ON project_task_runs(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_task_runs_task_id
        ON project_task_runs(task_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_task_runs_session_id
        ON project_task_runs(session_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_task_runs_status
        ON project_task_runs(status, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '015_project_runtime_profiles',
    sql: `
      CREATE TABLE IF NOT EXISTS project_runtime_profiles (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        default_provider_id TEXT,
        default_model TEXT,
        orchestration_mode TEXT NOT NULL DEFAULT 'ROUTA',
        enabled_skill_ids_json TEXT NOT NULL DEFAULT '[]',
        enabled_mcp_server_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_runtime_profiles_project_id
        ON project_runtime_profiles(project_id)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '016_project_runtime_profiles_configs',
    sql: `
      ALTER TABLE project_runtime_profiles
        ADD COLUMN skill_configs_json TEXT NOT NULL DEFAULT '{}';

      ALTER TABLE project_runtime_profiles
        ADD COLUMN mcp_server_configs_json TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: '017_project_codebases',
    sql: `
      CREATE TABLE IF NOT EXISTS project_codebases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        repo_path TEXT,
        source_type TEXT,
        source_url TEXT,
        branch TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_codebases_project_id
        ON project_codebases(project_id, is_default DESC, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_codebases_repo_path_active
        ON project_codebases(repo_path)
        WHERE repo_path IS NOT NULL AND deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_codebases_source_url_active
        ON project_codebases(source_url)
        WHERE source_url IS NOT NULL AND deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_codebases_default_active
        ON project_codebases(project_id)
        WHERE is_default = 1 AND deleted_at IS NULL;

      INSERT INTO project_codebases (
        id,
        project_id,
        title,
        repo_path,
        source_type,
        source_url,
        branch,
        is_default,
        created_at,
        updated_at,
        deleted_at
      )
      SELECT
        'cdb_' || lower(hex(randomblob(6))),
        projects.id,
        projects.title,
        projects.workspace_root,
        projects.source_type,
        projects.source_url,
        NULL,
        1,
        projects.created_at,
        projects.updated_at,
        NULL
      FROM projects
      WHERE projects.deleted_at IS NULL
        AND (projects.workspace_root IS NOT NULL OR projects.source_url IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM project_codebases
          WHERE project_codebases.project_id = projects.id
            AND project_codebases.deleted_at IS NULL
        );
    `,
  },
  {
    version: '018_project_acp_sessions_status_split',
    sql: `
      ALTER TABLE project_acp_sessions
        ADD COLUMN acp_status TEXT NOT NULL DEFAULT 'connecting';

      ALTER TABLE project_acp_sessions
        ADD COLUMN acp_error TEXT;

      UPDATE project_acp_sessions
      SET
        acp_status = CASE
          WHEN state = 'FAILED' THEN 'error'
          WHEN runtime_session_id IS NOT NULL THEN 'ready'
          ELSE 'connecting'
        END,
        acp_error = CASE
          WHEN state = 'FAILED' THEN failure_reason
          ELSE NULL
        END;
    `,
  },
  {
    version: '019_project_tasks_session_split',
    sql: `
      ALTER TABLE project_tasks
        ADD COLUMN session_id TEXT;

      UPDATE project_tasks
      SET session_id = trigger_session_id
      WHERE session_id IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_session_id
        ON project_tasks(session_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '020_project_worktrees',
    sql: `
      CREATE TABLE IF NOT EXISTS project_worktrees (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        codebase_id TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        branch TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'creating',
        session_id TEXT,
        label TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (codebase_id) REFERENCES project_codebases(id),
        FOREIGN KEY (session_id) REFERENCES project_acp_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_worktrees_project_id
        ON project_worktrees(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_worktrees_codebase_id
        ON project_worktrees(codebase_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_worktrees_session_id
        ON project_worktrees(session_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_worktrees_codebase_branch_active
        ON project_worktrees(codebase_id, branch)
        WHERE deleted_at IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_worktrees_path_active
        ON project_worktrees(worktree_path)
        WHERE deleted_at IS NULL;

      ALTER TABLE project_tasks
        ADD COLUMN codebase_id TEXT REFERENCES project_codebases(id);

      ALTER TABLE project_tasks
        ADD COLUMN worktree_id TEXT REFERENCES project_worktrees(id);

      CREATE INDEX IF NOT EXISTS idx_project_tasks_codebase_id
        ON project_tasks(codebase_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_worktree_id
        ON project_tasks(worktree_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      ALTER TABLE project_acp_sessions
        ADD COLUMN codebase_id TEXT REFERENCES project_codebases(id);

      ALTER TABLE project_acp_sessions
        ADD COLUMN worktree_id TEXT REFERENCES project_worktrees(id);

      CREATE INDEX IF NOT EXISTS idx_project_acp_sessions_codebase_id
        ON project_acp_sessions(codebase_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_acp_sessions_worktree_id
        ON project_acp_sessions(worktree_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '021_project_acp_sessions_model',
    sql: `
      ALTER TABLE project_acp_sessions
        ADD COLUMN model TEXT;
    `,
  },
  {
    version: '022_settings_remove_model_defaults',
    sql: `
      ALTER TABLE settings
        DROP COLUMN model_provider;

      ALTER TABLE settings
        DROP COLUMN default_model;
    `,
  },
  {
    version: '023_project_delegation_groups',
    sql: `
      CREATE TABLE IF NOT EXISTS project_delegation_groups (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        caller_session_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (caller_session_id) REFERENCES project_acp_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_delegation_groups_project_id
        ON project_delegation_groups(project_id, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_project_delegation_groups_caller_session_id
        ON project_delegation_groups(caller_session_id, updated_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_delegation_groups_active_caller
        ON project_delegation_groups(project_id, caller_session_id)
        WHERE status = 'ACTIVE';
    `,
  },
];
