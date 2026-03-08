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
];
