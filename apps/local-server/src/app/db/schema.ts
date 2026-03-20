import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectPayload } from '../schemas/project';
import type { ProjectRuntimeProfilePayload } from '../schemas/runtime-profile';
import type { SchedulePayload } from '../schemas/schedule';
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

export const projectSchedulesTable = sqliteTable('project_schedules', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  workflowId: text('workflow_id').notNull(),
  name: text('name').notNull(),
  cronExpr: text('cron_expr').notNull(),
  triggerTarget: text('trigger_target').$type<SchedulePayload['triggerTarget']>().notNull(),
  triggerPayloadTemplate: text('trigger_payload_template'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  lastWorkflowRunId: text('last_workflow_run_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectBackgroundTasksTable = sqliteTable('project_background_tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  taskId: text('task_id'),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  agentId: text('agent_id').notNull(),
  status: text('status').notNull(),
  triggeredBy: text('triggered_by').notNull(),
  triggerSource: text('trigger_source').notNull(),
  priority: text('priority').notNull(),
  resultSessionId: text('result_session_id'),
  errorMessage: text('error_message'),
  attempts: integer('attempts').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
  lastActivityAt: text('last_activity_at'),
  currentActivity: text('current_activity'),
  toolCallCount: integer('tool_call_count'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  workflowRunId: text('workflow_run_id'),
  workflowStepName: text('workflow_step_name'),
  dependsOnTaskIdsJson: text('depends_on_task_ids_json').notNull(),
  taskOutput: text('task_output'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  specialistId: text('specialist_id'),
});

export const projectRuntimeProfilesTable = sqliteTable('project_runtime_profiles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  defaultProviderId: text('default_provider_id'),
  defaultModel: text('default_model'),
  orchestrationMode: text('orchestration_mode')
    .$type<ProjectRuntimeProfilePayload['orchestrationMode']>()
    .notNull(),
  enabledSkillIdsJson: text('enabled_skill_ids_json').notNull(),
  enabledMcpServerIdsJson: text('enabled_mcp_server_ids_json').notNull(),
  skillConfigsJson: text('skill_configs_json').notNull(),
  mcpServerConfigsJson: text('mcp_server_configs_json').notNull(),
  roleDefaultsJson: text('role_defaults_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectWorkflowDefinitionsTable = sqliteTable('project_workflow_definitions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').notNull(),
  stepsJson: text('steps_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectWorkflowRunsTable = sqliteTable('project_workflow_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  projectId: text('project_id').notNull(),
  workflowName: text('workflow_name').notNull(),
  workflowVersion: integer('workflow_version').notNull(),
  status: text('status').notNull(),
  triggerSource: text('trigger_source').notNull(),
  triggerPayload: text('trigger_payload'),
  currentStepName: text('current_step_name'),
  totalSteps: integer('total_steps').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectAcpSessionsTable = sqliteTable('project_acp_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  actorId: text('actor_id').notNull(),
  parentSessionId: text('parent_session_id'),
  name: text('name'),
  model: text('model'),
  provider: text('provider').notNull(),
  state: text('state').notNull(),
  runtimeSessionId: text('runtime_session_id'),
  failureReason: text('failure_reason'),
  lastEventId: text('last_event_id'),
  startedAt: text('started_at'),
  lastActivityAt: text('last_activity_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  cancelRequestedAt: text('cancel_requested_at'),
  cwd: text('cwd'),
  forceKilledAt: text('force_killed_at'),
  agentId: text('agent_id'),
  specialistId: text('specialist_id'),
  taskId: text('task_id'),
  timeoutScope: text('timeout_scope'),
});

export const projectAcpSessionEventsTable = sqliteTable('project_acp_session_events', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull(),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(),
  payloadJson: text('payload_json').notNull(),
  errorJson: text('error_json'),
  emittedAt: text('emitted_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const projectTasksTable = sqliteTable('project_tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  parentTaskId: text('parent_task_id'),
  kind: text('kind'),
  sourceType: text('source_type'),
  sourceEventId: text('source_event_id'),
  sourceEntryIndex: integer('source_entry_index'),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectTracesTable = sqliteTable('project_traces', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  projectId: text('project_id').notNull(),
  sessionId: text('session_id').notNull(),
  provider: text('provider').notNull(),
  model: text('model'),
  eventType: text('event_type').notNull(),
  sourceTraceId: text('source_trace_id'),
  summary: text('summary').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const projectTaskRunsTable = sqliteTable('project_task_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  taskId: text('task_id').notNull(),
  sessionId: text('session_id'),
  kind: text('kind').notNull(),
  role: text('role'),
  provider: text('provider'),
  specialistId: text('specialist_id'),
  status: text('status').notNull(),
  summary: text('summary'),
  verificationVerdict: text('verification_verdict'),
  verificationReport: text('verification_report'),
  retryOfRunId: text('retry_of_run_id'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectWorktreesTable = sqliteTable('project_worktrees', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  codebaseId: text('codebase_id').notNull(),
  worktreePath: text('worktree_path').notNull(),
  branch: text('branch').notNull(),
  baseBranch: text('base_branch').notNull(),
  status: text('status').notNull(),
  sessionId: text('session_id'),
  label: text('label'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectKanbanBoardsTable = sqliteTable('project_kanban_boards', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull(),
  settingsJson: text('settings_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const projectKanbanColumnsTable = sqliteTable('project_kanban_columns', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  stage: text('stage'),
  automationJson: text('automation_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
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
  projectSchedules: projectSchedulesTable,
  projectBackgroundTasks: projectBackgroundTasksTable,
  projectRuntimeProfiles: projectRuntimeProfilesTable,
  projectWorkflowDefinitions: projectWorkflowDefinitionsTable,
  projectWorkflowRuns: projectWorkflowRunsTable,
  projectAcpSessions: projectAcpSessionsTable,
  projectAcpSessionEvents: projectAcpSessionEventsTable,
  projectTasks: projectTasksTable,
  projectTraces: projectTracesTable,
  projectTaskRuns: projectTaskRunsTable,
  projectWorktrees: projectWorktreesTable,
  projectKanbanBoards: projectKanbanBoardsTable,
  projectKanbanColumns: projectKanbanColumnsTable,
  syncState: syncStateTable,
  syncConflicts: syncConflictsTable,
};
