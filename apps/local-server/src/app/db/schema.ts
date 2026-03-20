import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectPayload } from '../schemas/project';
import type {
  SyncConflictPayload,
  SyncConflictResolution,
  SyncRuntimeStatus,
} from '../schemas/sync';
import type { SettingsPayload } from '../schemas/settings';

export const schemaMigrationsTable = sqliteTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAt: text('applied_at').notNull(),
});

export const settingsTable = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  theme: text('theme').$type<SettingsPayload['theme']>().notNull(),
  syncEnabled: integer('sync_enabled', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectsTable = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  workspaceRoot: text('workspace_root'),
  sourceType: text('source_type').$type<ProjectPayload['sourceType']>(),
  sourceUrl: text('source_url'),
});

export const projectCodebasesTable = sqliteTable('project_codebases', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  repoPath: text('repo_path'),
  sourceType: text('source_type').$type<ProjectPayload['sourceType']>(),
  sourceUrl: text('source_url'),
  branch: text('branch'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectAgentsTable = sqliteTable('project_agents', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  parentAgentId: text('parent_agent_id'),
  specialistId: text('specialist_id'),
});

export const syncStateTable = sqliteTable('sync_state', {
  id: integer('id').primaryKey(),
  status: text('status').$type<SyncRuntimeStatus>().notNull(),
  paused: integer('paused', { mode: 'boolean' }).notNull(),
  lastRunAt: text('last_run_at'),
  lastSuccessfulSyncAt: text('last_successful_sync_at'),
  lastError: text('last_error'),
  updatedAt: text('updated_at').notNull(),
});

export const syncConflictsTable = sqliteTable('sync_conflicts', {
  id: text('id').primaryKey(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  title: text('title').notNull(),
  localSummary: text('local_summary').notNull(),
  remoteSummary: text('remote_summary').notNull(),
  status: text('status').$type<SyncConflictPayload['status']>().notNull(),
  resolution: text('resolution').$type<SyncConflictResolution | null>(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sqliteSchema = {
  schemaMigrations: schemaMigrationsTable,
  settings: settingsTable,
  projects: projectsTable,
  projectCodebases: projectCodebasesTable,
  projectAgents: projectAgentsTable,
  syncState: syncStateTable,
  syncConflicts: syncConflictsTable,
};
