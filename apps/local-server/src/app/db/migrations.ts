export interface SqliteMigration {
  sql: string;
  version: string;
}

export const sqliteMigrations: SqliteMigration[] = [
  {
    version: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        default_model TEXT NOT NULL,
        sync_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `,
  },
  {
    version: '003_agents_table',
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
    version: '004_orchestration_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS orchestration_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL,
        strategy_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS orchestration_steps (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        max_attempts INTEGER NOT NULL,
        depends_on_json TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES orchestration_sessions(id)
      );

      CREATE TABLE IF NOT EXISTS orchestration_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        step_id TEXT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES orchestration_sessions(id),
        FOREIGN KEY (step_id) REFERENCES orchestration_steps(id)
      );

      CREATE INDEX IF NOT EXISTS idx_orchestration_steps_session_id
        ON orchestration_steps(session_id, order_index);

      CREATE INDEX IF NOT EXISTS idx_orchestration_events_session_id
        ON orchestration_events(session_id, at);

      CREATE INDEX IF NOT EXISTS idx_orchestration_events_step_id
        ON orchestration_events(step_id, at);
    `,
  },
  {
    version: '005_sync_tables',
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
    version: '006_orchestration_runtime_metadata',
    sql: `
      ALTER TABLE orchestration_sessions
        ADD COLUMN provider TEXT NOT NULL DEFAULT 'codex';

      ALTER TABLE orchestration_sessions
        ADD COLUMN workspace_root TEXT;

      ALTER TABLE orchestration_sessions
        ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'ROUTA';

      ALTER TABLE orchestration_sessions
        ADD COLUMN trace_id TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN role TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN input_json TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN output_json TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN runtime_session_id TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN runtime_cursor TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN started_at TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN completed_at TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN error_code TEXT;

      ALTER TABLE orchestration_steps
        ADD COLUMN error_message TEXT;

      CREATE TABLE IF NOT EXISTS orchestration_artifacts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        content_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES orchestration_sessions(id),
        FOREIGN KEY (step_id) REFERENCES orchestration_steps(id)
      );

      CREATE INDEX IF NOT EXISTS idx_orchestration_artifacts_session_id
        ON orchestration_artifacts(session_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_orchestration_artifacts_step_id
        ON orchestration_artifacts(step_id, created_at);
    `,
  },
  {
    version: '007_project_workspace_root',
    sql: `
      ALTER TABLE projects
        ADD COLUMN workspace_root TEXT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_workspace_root_active
        ON projects(workspace_root)
        WHERE workspace_root IS NOT NULL AND deleted_at IS NULL;
    `,
  },
  {
    version: '008_project_repository_source',
    sql: `
      ALTER TABLE projects
        ADD COLUMN source_type TEXT;

      ALTER TABLE projects
        ADD COLUMN source_url TEXT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_source_url_active
        ON projects(source_url)
        WHERE source_url IS NOT NULL AND deleted_at IS NULL;
    `,
  },
  {
    version: '009_project_acp_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS project_acp_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        parent_session_id TEXT,
        name TEXT,
        provider TEXT NOT NULL,
        mode TEXT NOT NULL,
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
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (parent_session_id) REFERENCES project_acp_sessions(id)
      );

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

      CREATE INDEX IF NOT EXISTS idx_project_acp_sessions_project_id
        ON project_acp_sessions(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_acp_session_events_session_id
        ON project_acp_session_events(session_id, sequence ASC);
    `,
  },
  {
    version: '010_remove_conversations_and_messages',
    sql: `
      DROP INDEX IF EXISTS idx_messages_conversation_id;
      DROP INDEX IF EXISTS idx_conversations_project_id;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS conversations;
    `,
  },
  {
    version: '011_project_acp_session_cwd',
    sql: `
      ALTER TABLE project_acp_sessions
        ADD COLUMN cwd TEXT;

      UPDATE project_acp_sessions
      SET cwd = (
        SELECT projects.workspace_root
        FROM projects
        WHERE projects.id = project_acp_sessions.project_id
      )
      WHERE cwd IS NULL;
    `,
  },
  {
    version: '013_project_tasks',
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
    version: '014_project_agents',
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
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_agents_project_id
        ON project_agents(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '015_acp_session_agents',
    sql: `
      ALTER TABLE project_agents
        ADD COLUMN parent_agent_id TEXT;

      ALTER TABLE project_agents
        ADD COLUMN specialist_id TEXT;

      ALTER TABLE project_acp_sessions
        ADD COLUMN agent_id TEXT;

      ALTER TABLE project_acp_sessions
        ADD COLUMN specialist_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_project_agents_parent_agent_id
        ON project_agents(parent_agent_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_agents_specialist_id
        ON project_agents(specialist_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_acp_sessions_agent_id
        ON project_acp_sessions(agent_id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    version: '016_remove_project_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS project_tasks_next (
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

      INSERT INTO project_tasks_next (
        id,
        project_id,
        trigger_session_id,
        title,
        objective,
        scope,
        status,
        board_id,
        column_id,
        position,
        priority,
        labels_json,
        assignee,
        assigned_provider,
        assigned_role,
        assigned_specialist_id,
        assigned_specialist_name,
        dependencies_json,
        parallel_group,
        acceptance_criteria_json,
        verification_commands_json,
        completion_summary,
        verification_verdict,
        verification_report,
        github_id,
        github_number,
        github_url,
        github_repo,
        github_state,
        github_synced_at,
        last_sync_error,
        created_at,
        updated_at,
        deleted_at
      )
      SELECT
        id,
        project_id,
        CASE
          WHEN trigger_session_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM project_acp_sessions
              WHERE project_acp_sessions.id = project_tasks.trigger_session_id
            )
          THEN trigger_session_id
          ELSE NULL
        END,
        title,
        objective,
        scope,
        status,
        board_id,
        column_id,
        position,
        priority,
        labels_json,
        assignee,
        assigned_provider,
        assigned_role,
        assigned_specialist_id,
        assigned_specialist_name,
        dependencies_json,
        parallel_group,
        acceptance_criteria_json,
        verification_commands_json,
        completion_summary,
        verification_verdict,
        verification_report,
        github_id,
        github_number,
        github_url,
        github_repo,
        github_state,
        github_synced_at,
        last_sync_error,
        created_at,
        updated_at,
        deleted_at
      FROM project_tasks;

      DROP TABLE project_tasks;

      ALTER TABLE project_tasks_next RENAME TO project_tasks;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id
        ON project_tasks(project_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_trigger_session_id
        ON project_tasks(trigger_session_id, updated_at DESC)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_tasks_status
        ON project_tasks(status, updated_at DESC)
        WHERE deleted_at IS NULL;

      DROP TABLE IF EXISTS project_sessions;
    `,
  },
  {
    version: '017_drop_acp_session_mode',
    sql: `
      ALTER TABLE project_acp_sessions
        DROP COLUMN mode;
    `,
  },
  {
    version: '018_drop_orchestration_tables',
    sql: `
      DROP TABLE IF EXISTS orchestration_artifacts;
      DROP TABLE IF EXISTS orchestration_events;
      DROP TABLE IF EXISTS orchestration_steps;
      DROP TABLE IF EXISTS orchestration_sessions;
    `,
  },
  {
    version: '019_cleanup_orchestration_sync_conflicts',
    sql: `
      DELETE FROM sync_conflicts
      WHERE resource_type = 'orchestration-session';
    `,
  },
];
