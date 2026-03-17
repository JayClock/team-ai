import type { FastifyReply } from 'fastify';

const VENDOR_PREFIX = 'application/vnd.business-driven-ai';

function vendorMediaType(resourceType: string) {
  return `${VENDOR_PREFIX}.${resourceType}+json`;
}

export const VENDOR_MEDIA_TYPES = {
  acpHistory: vendorMediaType('acp-history'),
  acpProviders: vendorMediaType('acp-providers'),
  acpSession: vendorMediaType('acp-session'),
  acpSessionContext: vendorMediaType('acp-session-context'),
  acpSessions: vendorMediaType('acp-sessions'),
  agent: vendorMediaType('agent'),
  agents: vendorMediaType('agents'),
  backgroundTask: vendorMediaType('background-task'),
  backgroundTasks: vendorMediaType('background-tasks'),
  codebase: vendorMediaType('codebase'),
  codebases: vendorMediaType('codebases'),
  flow: vendorMediaType('flow'),
  flows: vendorMediaType('flows'),
  installedAcpProvider: vendorMediaType('installed-acp-provider'),
  kanbanBoard: vendorMediaType('kanban-board'),
  kanbanBoards: vendorMediaType('kanban-boards'),
  note: vendorMediaType('note'),
  noteEvents: vendorMediaType('note-events'),
  notes: vendorMediaType('notes'),
  project: vendorMediaType('project'),
  projectRuntimeProfile: vendorMediaType('project-runtime-profile'),
  projects: vendorMediaType('projects'),
  providerModels: vendorMediaType('provider-models'),
  providers: vendorMediaType('providers'),
  role: vendorMediaType('role'),
  roles: vendorMediaType('roles'),
  root: vendorMediaType('root'),
  schedule: vendorMediaType('schedule'),
  schedules: vendorMediaType('schedules'),
  settings: vendorMediaType('settings'),
  specialist: vendorMediaType('specialist'),
  specialists: vendorMediaType('specialists'),
  syncConflict: vendorMediaType('sync-conflict'),
  syncConflicts: vendorMediaType('sync-conflicts'),
  syncStatus: vendorMediaType('sync-status'),
  task: vendorMediaType('task'),
  taskRun: vendorMediaType('task-run'),
  taskRuns: vendorMediaType('task-runs'),
  tasks: vendorMediaType('tasks'),
  trace: vendorMediaType('trace'),
  traces: vendorMediaType('traces'),
  traceStats: vendorMediaType('trace-stats'),
  user: vendorMediaType('user'),
  workflow: vendorMediaType('workflow'),
  workflowRun: vendorMediaType('workflow-run'),
  workflowRuns: vendorMediaType('workflow-runs'),
  workflows: vendorMediaType('workflows'),
  webhookConfig: vendorMediaType('webhook-config'),
  webhookConfigs: vendorMediaType('webhook-configs'),
  webhookLogs: vendorMediaType('webhook-logs'),
  worktree: vendorMediaType('worktree'),
  worktrees: vendorMediaType('worktrees'),
} as const;

export function setVendorMediaType(reply: FastifyReply, mediaType: string) {
  reply.type(mediaType);
}
