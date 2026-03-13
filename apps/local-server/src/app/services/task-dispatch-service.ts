import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import type { RoleValue } from '../schemas/role';
import type { SpecialistPayload } from '../schemas/specialist';
import type { TaskPayload } from '../schemas/task';
import { getProjectRuntimeProfile } from './project-runtime-profile-service';
import {
  getDefaultSpecialistByRole,
  getSpecialistById,
} from './specialist-service';
import {
  getTaskById,
  getTaskDispatchability,
  listDispatchableTasks,
  updateTask,
  type TaskDispatchability,
} from './task-service';

interface TaskTriggerSessionRow {
  actor_id: string;
  id: string;
  project_id: string;
  provider: string;
}

export interface DispatchTaskCallbacks {
  createSession(input: {
    actorUserId: string;
    goal?: string;
    parentSessionId?: string | null;
    projectId: string;
    provider: string;
    retryOfRunId?: string | null;
    role?: string | null;
    specialistId?: string;
    taskId?: string | null;
  }): Promise<{ id: string }>;
  promptSession(input: {
    projectId: string;
    prompt: string;
    sessionId: string;
  }): Promise<unknown>;
}

export interface DispatchTaskInput {
  retryOfRunId?: string | null;
  taskId: string;
}

export interface DispatchTaskResult {
  dispatchability: TaskDispatchability;
  dispatched: boolean;
  prompt: string | null;
  provider: string | null;
  reason: 'TASK_ALREADY_DISPATCHING' | 'TASK_NOT_DISPATCHABLE' | null;
  role: RoleValue | null;
  sessionId: string | null;
  specialistId: string | null;
  task: TaskPayload;
}

export interface DispatchTasksInput {
  limit?: number;
  projectId: string;
  sessionId?: string;
}

export interface DispatchTasksResult {
  dispatchedCount: number;
  results: DispatchTaskResult[];
}

const activeDispatchClaims = new Set<string>();

function tryClaimTaskDispatch(taskId: string) {
  if (activeDispatchClaims.has(taskId)) {
    return false;
  }

  activeDispatchClaims.add(taskId);
  return true;
}

function releaseTaskDispatchClaim(taskId: string) {
  activeDispatchClaims.delete(taskId);
}

function getTriggerSessionRow(
  sqlite: Database,
  sessionId: string,
): TaskTriggerSessionRow {
  const row = sqlite
    .prepare(
      `
        SELECT id, project_id, actor_id, provider
        FROM project_acp_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(sessionId) as TaskTriggerSessionRow | undefined;

  if (!row) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/task-dispatch-trigger-session-missing',
      title: 'Task Dispatch Trigger Session Missing',
      status: 409,
      detail: `Task dispatch trigger session ${sessionId} is not available`,
    });
  }

  return row;
}

function resolveDispatchProvider(
  task: Pick<TaskPayload, 'assignedProvider'>,
  triggerSession: Pick<TaskTriggerSessionRow, 'provider'>,
  defaultProviderId: string | null,
) {
  return (
    task.assignedProvider ??
    triggerSession.provider ??
    defaultProviderId ??
    'codex'
  );
}

function buildTaskDispatchPrompt(task: TaskPayload) {
  const sections = [`Task: ${task.title}`, `Objective:\n${task.objective}`];

  if (task.scope?.trim()) {
    sections.push(`Scope:\n${task.scope.trim()}`);
  }

  if (task.acceptanceCriteria.length > 0) {
    sections.push(
      `Acceptance Criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}`,
    );
  }

  if (task.verificationCommands.length > 0) {
    sections.push(
      `Verification Commands:\n${task.verificationCommands
        .map((command) => `- ${command}`)
        .join('\n')}`,
    );
  }

  if (task.dependencies.length > 0) {
    sections.push(
      `Dependencies:\n${task.dependencies.map((dependency) => `- ${dependency}`).join('\n')}`,
    );
  }

  sections.push(
    'Keep the work scoped to this task, then report the outcome and validation clearly.',
  );

  return sections.join('\n\n');
}

async function resolveDispatchSpecialist(
  sqlite: Database,
  task: TaskPayload,
  role: RoleValue,
): Promise<SpecialistPayload> {
  if (task.assignedSpecialistId) {
    return getSpecialistById(sqlite, task.projectId, task.assignedSpecialistId);
  }

  return getDefaultSpecialistByRole(sqlite, task.projectId, role);
}

async function hydrateTaskAssignment(
  sqlite: Database,
  task: TaskPayload,
  role: RoleValue,
  specialist: SpecialistPayload,
  provider: string,
): Promise<TaskPayload> {
  const patch: Parameters<typeof updateTask>[2] = {};

  if (task.assignedRole !== role) {
    patch.assignedRole = role;
  }

  if (task.assignedSpecialistId !== specialist.id) {
    patch.assignedSpecialistId = specialist.id;
  }

  if (task.assignedSpecialistName !== specialist.name) {
    patch.assignedSpecialistName = specialist.name;
  }

  if (task.assignedProvider !== provider) {
    patch.assignedProvider = provider;
  }

  if (Object.keys(patch).length === 0) {
    return task;
  }

  return updateTask(sqlite, task.id, patch);
}

export async function dispatchTask(
  sqlite: Database,
  callbacks: DispatchTaskCallbacks,
  input: DispatchTaskInput,
): Promise<DispatchTaskResult> {
  const initialTask = await getTaskById(sqlite, input.taskId);

  if (!tryClaimTaskDispatch(initialTask.id)) {
    return {
      dispatchability: await getTaskDispatchability(sqlite, initialTask.id),
      dispatched: false,
      prompt: null,
      provider: initialTask.assignedProvider,
      reason: 'TASK_ALREADY_DISPATCHING',
      role: null,
      sessionId: null,
      specialistId: null,
      task: initialTask,
    };
  }

  try {
    const runtimeProfile = await getProjectRuntimeProfile(
      sqlite,
      initialTask.projectId,
    );
    const dispatchability = await getTaskDispatchability(
      sqlite,
      initialTask.id,
      {
        orchestrationMode: runtimeProfile.orchestrationMode,
      },
    );

    if (!dispatchability.dispatchable || !dispatchability.resolvedRole) {
      return {
        dispatchability,
        dispatched: false,
        prompt: null,
        provider: dispatchability.task.assignedProvider,
        reason: 'TASK_NOT_DISPATCHABLE',
        role: dispatchability.resolvedRole,
        sessionId: null,
        specialistId: dispatchability.task.assignedSpecialistId,
        task: dispatchability.task,
      };
    }

    const triggerSession = getTriggerSessionRow(
      sqlite,
      dispatchability.task.triggerSessionId as string,
    );
    const provider = resolveDispatchProvider(
      dispatchability.task,
      triggerSession,
      runtimeProfile.defaultProviderId,
    );
    const specialist = await resolveDispatchSpecialist(
      sqlite,
      dispatchability.task,
      dispatchability.resolvedRole,
    );
    const hydratedTask = await hydrateTaskAssignment(
      sqlite,
      dispatchability.task,
      dispatchability.resolvedRole,
      specialist,
      provider,
    );
    const prompt = buildTaskDispatchPrompt(hydratedTask);
    const createdSession = await callbacks.createSession({
      actorUserId: triggerSession.actor_id,
      goal: hydratedTask.title,
      parentSessionId: triggerSession.id,
      projectId: hydratedTask.projectId,
      provider,
      retryOfRunId: input.retryOfRunId,
      role: dispatchability.resolvedRole,
      specialistId: specialist.id,
      taskId: hydratedTask.id,
    });

    await callbacks.promptSession({
      projectId: hydratedTask.projectId,
      prompt,
      sessionId: createdSession.id,
    });

    return {
      dispatchability: {
        ...dispatchability,
        task: hydratedTask,
      },
      dispatched: true,
      prompt,
      provider,
      reason: null,
      role: dispatchability.resolvedRole,
      sessionId: createdSession.id,
      specialistId: specialist.id,
      task: hydratedTask,
    };
  } finally {
    releaseTaskDispatchClaim(initialTask.id);
  }
}

export async function dispatchTasks(
  sqlite: Database,
  callbacks: DispatchTaskCallbacks,
  input: DispatchTasksInput,
): Promise<DispatchTasksResult> {
  const runtimeProfile = await getProjectRuntimeProfile(
    sqlite,
    input.projectId,
  );
  const candidates = await listDispatchableTasks(
    sqlite,
    {
      projectId: input.projectId,
      sessionId: input.sessionId,
    },
    {
      orchestrationMode: runtimeProfile.orchestrationMode,
    },
  );
  const limit = input.limit ?? candidates.length;
  const results: DispatchTaskResult[] = [];

  for (const candidate of candidates.slice(0, limit)) {
    results.push(
      await dispatchTask(sqlite, callbacks, {
        taskId: candidate.task.id,
      }),
    );
  }

  return {
    dispatchedCount: results.filter((result) => result.dispatched).length,
    results,
  };
}

export function resetTaskDispatchClaimsForTest() {
  activeDispatchClaims.clear();
}
