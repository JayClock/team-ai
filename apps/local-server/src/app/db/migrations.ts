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

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_project_id
        ON conversations(project_id);

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
        ON messages(conversation_id);
    `,
  },
  {
    version: '002_message_runtime_columns',
    sql: `
      ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
      ALTER TABLE messages ADD COLUMN error_message TEXT;
      ALTER TABLE messages ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
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
];
