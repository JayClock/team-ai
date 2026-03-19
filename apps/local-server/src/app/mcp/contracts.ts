import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { taskStatusValues } from '../services/task-service';
import { DEFAULT_ACP_PROMPT_TIMEOUT_MS } from '../services/acp-service';

export const mcpAccessModeHeader = 'x-teamai-mcp-access-mode';
export const mcpSessionHeader = 'mcp-session-id';
export const mcpRoutePath = '/api/mcp';

export type McpAccessMode = 'read-only' | 'read-write';
export type McpToolAccess = 'read' | 'write';

export interface McpToolDefinition {
  access: McpToolAccess;
  tool: {
    annotations: {
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
      readOnlyHint: boolean;
      title?: string;
    };
    description: string;
    name: string;
    title: string;
  };
}

export interface McpAuditContext {
  accessMode: McpAccessMode;
  argumentKeys: string[];
  mutationKeys: string[];
  parentNoteId: string | null;
  parentSessionId: string | null;
  projectId: string | null;
  sessionId: string | null;
  taskId: string | null;
  toolAccess: McpToolAccess;
  toolName: string;
}

export interface McpSession {
  accessMode: McpAccessMode;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

export const projectsListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().min(1).optional(),
  repoPath: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
});

export const agentsListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
});

const taskStatusSchema = z.enum(taskStatusValues);

export const tasksListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  status: taskStatusSchema.optional(),
});

export const taskGetArgsSchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));
const noteSourceAliasMap = new Map<string, 'user' | 'agent' | 'system'>([
  ['assistant', 'agent'],
  ['coordinator', 'agent'],
  ['model', 'agent'],
  ['orchestrator', 'agent'],
  ['planner', 'agent'],
  ['tool', 'agent'],
]);
const noteSourceSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();
  return noteSourceAliasMap.get(normalizedValue) ?? normalizedValue;
}, z.enum(['user', 'agent', 'system']));
const noteTypeSchema = z.enum(['spec', 'task', 'general']);
const mcpWritableTaskStatusSchema = z.enum([
  'PENDING',
  'READY',
  'WAITING_RETRY',
  'CANCELLED',
]);
const taskRunStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
const nullableTaskKindSchema = z.union([
  z.enum(['plan', 'implement', 'review', 'verify']),
  z.null(),
]);

export const taskUpdateArgsSchema = z
  .object({
    acceptanceCriteria: stringArraySchema.optional(),
    assignedProvider: nullableStringSchema.optional(),
    assignedRole: nullableStringSchema.optional(),
    assignedSpecialistId: nullableStringSchema.optional(),
    assignedSpecialistName: nullableStringSchema.optional(),
    completionSummary: nullableStringSchema.optional(),
    dependencies: stringArraySchema.optional(),
    labels: stringArraySchema.optional(),
    objective: z.string().trim().min(1).optional(),
    priority: nullableStringSchema.optional(),
    projectId: z.string().trim().min(1),
    scope: nullableStringSchema.optional(),
    status: mcpWritableTaskStatusSchema.optional(),
    taskId: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    verificationCommands: stringArraySchema.optional(),
    verificationReport: nullableStringSchema.optional(),
    verificationVerdict: nullableStringSchema.optional(),
  })
  .refine((input) => {
    const { projectId, taskId, ...patch } = input;
    void projectId;
    void taskId;
    return Object.keys(patch).length > 0;
  }, 'At least one task field must be provided');

export const createCardArgsSchema = z.object({
  acceptanceCriteria: stringArraySchema.optional(),
  assignedProvider: nullableStringSchema.optional(),
  assignedRole: nullableStringSchema.optional(),
  assignedSpecialistId: nullableStringSchema.optional(),
  assignedSpecialistName: nullableStringSchema.optional(),
  boardId: z.string().trim().min(1).optional(),
  columnId: z.string().trim().min(1).optional(),
  kind: nullableTaskKindSchema.optional(),
  objective: z.string().trim().min(1),
  position: z.coerce.number().int().nonnegative().optional(),
  priority: nullableStringSchema.optional(),
  projectId: z.string().trim().min(1),
  scope: nullableStringSchema.optional(),
  sessionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  verificationCommands: stringArraySchema.optional(),
});

export const updateCardArgsSchema = z
  .object({
    acceptanceCriteria: stringArraySchema.optional(),
    assignedProvider: nullableStringSchema.optional(),
    assignedRole: nullableStringSchema.optional(),
    assignedSpecialistId: nullableStringSchema.optional(),
    assignedSpecialistName: nullableStringSchema.optional(),
    cardId: z.string().trim().min(1),
    completionSummary: nullableStringSchema.optional(),
    dependencies: stringArraySchema.optional(),
    labels: stringArraySchema.optional(),
    objective: z.string().trim().min(1).optional(),
    priority: nullableStringSchema.optional(),
    projectId: z.string().trim().min(1),
    scope: nullableStringSchema.optional(),
    status: mcpWritableTaskStatusSchema.optional(),
    title: z.string().trim().min(1).optional(),
    verificationCommands: stringArraySchema.optional(),
    verificationReport: nullableStringSchema.optional(),
    verificationVerdict: nullableStringSchema.optional(),
  })
  .refine((input) => {
    const { cardId, projectId, ...patch } = input;
    void cardId;
    void projectId;
    return Object.keys(patch).length > 0;
  }, 'At least one card field must be provided');

export const moveCardArgsSchema = z.object({
  boardId: z.string().trim().min(1),
  cardId: z.string().trim().min(1),
  columnId: z.string().trim().min(1),
  position: z.coerce.number().int().nonnegative().optional(),
  projectId: z.string().trim().min(1),
});

export const blockCardArgsSchema = z.object({
  boardId: z.string().trim().min(1).optional(),
  cardId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
});

export const unblockCardArgsSchema = z.object({
  boardId: z.string().trim().min(1).optional(),
  cardId: z.string().trim().min(1),
  columnId: z.string().trim().min(1).optional(),
  position: z.coerce.number().int().nonnegative().optional(),
  projectId: z.string().trim().min(1),
});

export const getBoardViewArgsSchema = z.object({
  boardId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
});

export const requestPreviousLaneHandoffArgsSchema = z.object({
  artifactHints: stringArraySchema.optional(),
  projectId: z.string().trim().min(1),
  request: z.string().trim().min(1),
  requestType: z.enum([
    'environment_preparation',
    'runtime_context',
    'clarification',
    'rerun_command',
  ]),
  sessionId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

export const submitLaneHandoffArgsSchema = z.object({
  artifacts: stringArraySchema.optional(),
  handoffId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  status: z.enum(['completed', 'blocked', 'failed']),
  summary: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});

export const taskRunsListArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  status: taskRunStatusSchema.optional(),
  taskId: z.string().trim().min(1).optional(),
});

export const notesAppendArgsSchema = z.object({
  assignedAgentIds: stringArraySchema.optional(),
  content: z.string().min(1),
  parentNoteId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  source: noteSourceSchema.default('agent'),
  taskId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  type: noteTypeSchema.default('general'),
});

export const listNotesArgsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  type: noteTypeSchema.optional(),
});

export const readNoteArgsSchema = z.object({
  noteId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
});

export const setNoteContentArgsSchema = z.object({
  assignedAgentIds: stringArraySchema.optional(),
  content: z.string(),
  noteId: z.string().trim().min(1).optional(),
  parentNoteId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  source: noteSourceSchema.default('agent'),
  taskId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  type: noteTypeSchema.default('general'),
});

export const applyFlowTemplateArgsSchema = z.object({
  mergeStrategy: z.enum(['append', 'replace']).optional(),
  noteId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  variables: z.record(z.string(), z.string()).default({}),
});

export const delegateTaskToAgentArgsSchema = z.object({
  additionalInstructions: z.string().trim().min(1).optional(),
  callerSessionId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  specialist: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  waitMode: z.enum(['immediate', 'after_all']).optional(),
});

const delegationGroupStatusSchema = z.enum([
  'OPEN',
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);
const delegationWaveKindSchema = z.enum(['implement', 'gate']);

export const delegateTaskToAgentWaveStateSchema = z.object({
  completedCount: z.coerce.number().int().nonnegative(),
  failureCount: z.coerce.number().int().nonnegative(),
  groupId: nullableStringSchema,
  pendingCount: z.coerce.number().int().nonnegative(),
  settled: z.boolean(),
  status: delegationGroupStatusSchema.nullable(),
  taskIds: stringArraySchema,
  totalCount: z.coerce.number().int().nonnegative(),
  waveId: nullableStringSchema,
  waveKind: delegationWaveKindSchema.nullable(),
});

export const delegateTaskToAgentParentResumeSchema = z.object({
  condition: z.enum([
    'after_child_session_report',
    'after_delegation_group_settled',
    'manual_follow_up',
  ]),
  groupId: nullableStringSchema,
  pendingTaskCount: z.coerce.number().int().nonnegative(),
  taskIds: stringArraySchema,
  waitMode: z.enum(['immediate', 'after_all']),
});

export const readAgentConversationArgsSchema = z.object({
  includeTerminalOutput: z.coerce.boolean().optional(),
  includeThoughts: z.coerce.boolean().optional(),
  lastN: z.coerce.number().int().positive().max(200).optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
  projectId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  sinceEventId: z.string().trim().min(1).optional(),
});

export const reportToParentArgsSchema = z.object({
  areasChanged: stringArraySchema.optional(),
  blocker: nullableStringSchema.optional(),
  filesChanged: stringArraySchema.optional(),
  projectId: z.string().trim().min(1),
  residualRisk: nullableStringSchema.optional(),
  sessionId: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  verificationPerformed: stringArraySchema.optional(),
  verdict: z.enum(['completed', 'blocked', 'pass', 'fail']),
});

export const createAcpSessionArgsSchema = z.object({
  actorUserId: z.string().trim().min(1),
  goal: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).nullable().optional(),
  parentSessionId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  provider: z.string().trim().min(1).nullable().optional(),
  role: z.string().trim().min(1).optional(),
  specialistId: z.string().trim().min(1).optional(),
});

export const promptAcpSessionArgsSchema = z.object({
  eventId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  supervision: z
    .object({
      promptTimeoutMs: z.coerce
        .number()
        .int()
        .positive()
        .default(DEFAULT_ACP_PROMPT_TIMEOUT_MS),
      inactivityTimeoutMs: z.coerce.number().int().positive().optional(),
      totalTimeoutMs: z.coerce.number().int().positive().optional(),
      cancelGraceMs: z.coerce.number().int().positive().optional(),
      completionGraceMs: z.coerce.number().int().positive().optional(),
      providerInitTimeoutMs: z.coerce.number().int().positive().optional(),
      packageManagerInitTimeoutMs: z.coerce
        .number()
        .int()
        .positive()
        .optional(),
      maxSteps: z
        .union([z.null(), z.coerce.number().int().positive()])
        .optional(),
      maxRetries: z.coerce.number().int().nonnegative().optional(),
    })
    .default({
      promptTimeoutMs: DEFAULT_ACP_PROMPT_TIMEOUT_MS,
    }),
  traceId: z.string().trim().min(1).optional(),
});

export const cancelAcpSessionArgsSchema = z.object({
  projectId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1),
});
