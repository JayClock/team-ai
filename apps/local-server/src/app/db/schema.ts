import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectPayload } from '../schemas/project';
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

export const sqliteSchema = {
  schemaMigrations: schemaMigrationsTable,
  settings: settingsTable,
  projects: projectsTable,
  projectCodebases: projectCodebasesTable,
};
