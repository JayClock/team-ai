import type { FastifyReply } from 'fastify';

const VENDOR_PREFIX = 'application/vnd.business-driven-ai';

function vendorMediaType(resourceType: string) {
  return `${VENDOR_PREFIX}.${resourceType}+json`;
}

export const VENDOR_MEDIA_TYPES = {
  acpHistory: vendorMediaType('acp-history'),
  acpProviders: vendorMediaType('acp-providers'),
  acpSession: vendorMediaType('acp-session'),
  acpSessions: vendorMediaType('acp-sessions'),
  agent: vendorMediaType('agent'),
  agents: vendorMediaType('agents'),
  backgroundTask: vendorMediaType('background-task'),
  backgroundTasks: vendorMediaType('background-tasks'),
  codebase: vendorMediaType('codebase'),
  codebases: vendorMediaType('codebases'),
  installedAcpProvider: vendorMediaType('installed-acp-provider'),
  kanbanBoard: vendorMediaType('kanban-board'),
  kanbanBoards: vendorMediaType('kanban-boards'),
  note: vendorMediaType('note'),
  noteEvents: vendorMediaType('note-events'),
  notes: vendorMediaType('notes'),
  orchestrationSummary: vendorMediaType('orchestration-summary'),
  project: vendorMediaType('project'),
  projectRuntimeProfile: vendorMediaType('project-runtime-profile'),
  projects: vendorMediaType('projects'),
  providerModels: vendorMediaType('provider-models'),
  providers: vendorMediaType('providers'),
  role: vendorMediaType('role'),
  roles: vendorMediaType('roles'),
  root: vendorMediaType('root'),
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
  user: vendorMediaType('user'),
  workflow: vendorMediaType('workflow'),
  workflowRun: vendorMediaType('workflow-run'),
  workflowRuns: vendorMediaType('workflow-runs'),
  workflows: vendorMediaType('workflows'),
  worktree: vendorMediaType('worktree'),
  worktrees: vendorMediaType('worktrees'),
} as const;

export function setVendorMediaType(reply: FastifyReply, mediaType: string) {
  reply.type(mediaType);
}
