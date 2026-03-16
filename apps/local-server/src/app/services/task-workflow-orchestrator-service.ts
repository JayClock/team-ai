import type { Database } from 'better-sqlite3';
import type { DiagnosticLogger } from '../diagnostics';
import { ProblemError } from '../errors/problem-error';
import type { NotePayload } from '../schemas/note';
import type { TaskRunPayload } from '../schemas/task-run';
import { getAcpSessionById } from './acp-service';
import type { TaskKind, TaskPayload } from '../schemas/task';
import type { TaskExecutionRuntime } from './task-execution-runtime-service';
import {
  type ExecuteTaskResult,
  executeTask as executeTaskWithCallbacks,
  patchTaskAndMaybeExecute as patchTaskAndMaybeExecuteWithCallbacks,
  patchTaskFromMcpAndMaybeExecute as patchTaskFromMcpAndMaybeExecuteWithCallbacks,
  maybeAutoExecutePatchedTask as maybeAutoExecutePatchedTaskWithCallbacks,
  type AutoExecuteTaskPatch,
} from './task-orchestration-service';
import type {
  DispatchTaskResult,
  DispatchTasksResult,
} from './task-dispatch-service';
import { dispatchTask } from './task-dispatch-service';
import {
  findSpecNoteByScope,
  getNoteById,
} from './note-service';
import {
  type SyncSpecTasksResult,
  syncSpecNoteToTasks,
} from './spec-task-sync-service';
import {
  getTaskById,
  updateTask,
} from './task-service';

interface TaskWorkflowOrchestratorDependencies {
  executionRuntime: TaskExecutionRuntime;
  logger?: DiagnosticLogger;
  sqlite: Database;
}

interface TaskWorkflowExecutionOptions {
  callerSessionId?: string;
  logger?: DiagnosticLogger;
  retryOfRunId?: string | null;
  source?: string;
}

interface DispatchReadyTasksOptions extends TaskWorkflowExecutionOptions {
  limit?: number;
}

export type TaskWorkflowWaveKind = 'implement' | 'gate';

export interface TaskWorkflowScope {
  noteId: string;
  projectId: string;
  sessionId: string | null;
}

export interface TaskWorkflowWaveResult {
  blockedTaskIds: string[];
  completedTaskIds: string[];
  delegationGroupId: string;
  dispatchResults: DispatchTaskResult[];
  dispatchedTaskIds: string[];
  gateTaskIds: string[];
  pendingTaskIds: string[];
  readyTaskIds: string[];
  requiresGate: boolean;
  scope: TaskWorkflowScope;
  syncedTaskIds: string[];
  waveId: string;
  waveKind: TaskWorkflowWaveKind;
}

export interface SyncSpecAndDispatchReadyTasksResult
  extends TaskWorkflowWaveResult {
  taskSync: SyncSpecTasksResult;
}

export interface TaskWorkflowScopeInput {
  noteId?: string;
  projectId: string;
  sessionId?: string | null;
}

export interface SyncSpecAndDispatchReadyTasksOptions
  extends TaskWorkflowScopeInput,
    TaskWorkflowExecutionOptions {
  limit?: number;
}

export interface ResumeDelegationGroupOptions
  extends TaskWorkflowScopeInput,
    TaskWorkflowExecutionOptions {}

export interface TaskWorkflowOrchestrator {
  dispatchReadyTasks(
    projectId: string,
    options?: DispatchReadyTasksOptions,
  ): Promise<DispatchTasksResult>;
  dispatchGateTasksForCompletedWave(
    options: SyncSpecAndDispatchReadyTasksOptions,
  ): Promise<TaskWorkflowWaveResult>;
  executeTask(
    taskId: string,
    options?: TaskWorkflowExecutionOptions,
  ): Promise<ExecuteTaskResult>;
  resumeDelegationGroup(
    options: ResumeDelegationGroupOptions,
  ): Promise<TaskWorkflowWaveResult>;
  patchTaskAndMaybeExecute(
    taskId: string,
    patch: AutoExecuteTaskPatch,
    options?: TaskWorkflowExecutionOptions,
  ): Promise<TaskPayload>;
  patchTaskFromMcpAndMaybeExecute(
    taskId: string,
    patch: AutoExecuteTaskPatch,
    options?: TaskWorkflowExecutionOptions,
  ): Promise<TaskPayload>;
  maybeAutoExecutePatchedTask(
    task: TaskPayload,
    patch: AutoExecuteTaskPatch,
    options?: TaskWorkflowExecutionOptions,
  ): Promise<TaskPayload>;
  retryTaskRun(
    taskRunId: string,
    options?: Omit<TaskWorkflowExecutionOptions, 'callerSessionId' | 'retryOfRunId'>,
  ): Promise<TaskRunPayload>;
  syncSpecAndDispatchReadyTasks(
    options: SyncSpecAndDispatchReadyTasksOptions,
  ): Promise<SyncSpecAndDispatchReadyTasksResult>;
}

function throwTaskRunRetrySessionMissing(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-session-missing',
    title: 'Task Run Retry Session Missing',
    status: 409,
    detail:
      `Task run ${taskRunId} cannot be retried because no parent session is available`,
  });
}

function throwTaskRunRetryDispatchBlocked(
  taskRunId: string,
  detail: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-dispatch-blocked',
    title: 'Task Run Retry Dispatch Blocked',
    status: 409,
    detail,
  });
}

function throwTaskRunRetryNotCreated(taskRunId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-run-retry-not-created',
    title: 'Task Run Retry Not Created',
    status: 500,
    detail: `Task run ${taskRunId} was retried but no retry run was recorded`,
  });
}

function throwWorkflowSpecNoteMissing(
  projectId: string,
  sessionId: string | null,
  noteId?: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-workflow-spec-note-missing',
    title: 'Task Workflow Spec Note Missing',
    status: 404,
    detail: noteId
      ? `Spec note ${noteId} was not found for workflow orchestration`
      : sessionId
        ? `No spec note exists for project ${projectId} and session ${sessionId}`
        : `No project-scoped spec note exists for project ${projectId}`,
  });
}

function throwGateWaveNotReady(
  projectId: string,
  noteId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/task-workflow-gate-wave-not-ready',
    title: 'Task Workflow Gate Wave Not Ready',
    status: 409,
    detail:
      `Gate wave for spec note ${noteId} in project ${projectId} cannot start before implement tasks complete`,
  });
}

function buildDelegationGroupId(noteId: string) {
  return `twfg_${noteId}`;
}

function buildWaveId(noteId: string, waveKind: TaskWorkflowWaveKind) {
  return `${buildDelegationGroupId(noteId)}:${waveKind}`;
}

function isGateTaskKind(kind: TaskKind | null | undefined) {
  return kind === 'review' || kind === 'verify';
}

function isMutableWaveTaskStatus(status: string) {
  return status === 'PENDING' || status === 'WAITING_RETRY' || status === 'CANCELLED';
}

function partitionWaveTasks(tasks: TaskPayload[]) {
  const gateTasks = tasks.filter((task) => isGateTaskKind(task.kind));
  const implementTasks = tasks.filter((task) => !isGateTaskKind(task.kind));

  return {
    gateTasks,
    implementTasks,
  };
}

async function resolveWorkflowSpecNote(
  sqlite: Database,
  input: TaskWorkflowScopeInput,
): Promise<NotePayload> {
  const sessionId = input.sessionId ?? null;
  const note = input.noteId
    ? await getNoteById(sqlite, input.noteId)
    : await findSpecNoteByScope(sqlite, {
        projectId: input.projectId,
        sessionId,
      });

  if (!note || note.type !== 'spec') {
    throwWorkflowSpecNoteMissing(input.projectId, sessionId, input.noteId);
  }

  if (note.projectId !== input.projectId) {
    throwWorkflowSpecNoteMissing(input.projectId, sessionId, input.noteId);
  }

  if (input.sessionId !== undefined && note.sessionId !== sessionId) {
    throwWorkflowSpecNoteMissing(input.projectId, sessionId, input.noteId);
  }

  return note;
}

function listSpecNoteTaskIds(sqlite: Database, noteId: string) {
  return (
    sqlite
      .prepare(
        `
          SELECT id
          FROM project_tasks
          WHERE source_type = 'spec_note'
            AND source_event_id = ?
            AND deleted_at IS NULL
          ORDER BY source_entry_index ASC, created_at ASC
        `,
      )
      .all(noteId) as Array<{ id: string }>
  ).map((row) => row.id);
}

async function listSpecNoteTasks(sqlite: Database, noteId: string) {
  const taskIds = listSpecNoteTaskIds(sqlite, noteId);

  return await Promise.all(taskIds.map((taskId) => getTaskById(sqlite, taskId)));
}

async function readyWaveTasks(
  sqlite: Database,
  tasks: TaskPayload[],
) {
  const nextTasks: TaskPayload[] = [];

  for (const task of tasks) {
    if (
      isMutableWaveTaskStatus(task.status) &&
      !task.executionSessionId &&
      !task.resultSessionId
    ) {
      nextTasks.push(
        await updateTask(sqlite, task.id, {
          status: 'READY',
        }),
      );
      continue;
    }

    nextTasks.push(task);
  }

  return nextTasks;
}

async function dispatchWaveTasks(
  sqlite: Database,
  callbacks: TaskExecutionRuntime,
  tasks: TaskPayload[],
  options: SyncSpecAndDispatchReadyTasksOptions,
) {
  const dispatchResults: DispatchTaskResult[] = [];

  for (const task of tasks) {
    if (task.status !== 'READY') {
      continue;
    }

    dispatchResults.push(
      await dispatchTask(
        sqlite,
        callbacks,
        {
          callerSessionId: options.callerSessionId,
          taskId: task.id,
        },
        {
          logger: options.logger,
          source: options.source,
        },
      ),
    );
  }

  return dispatchResults;
}

function buildWaveResult(input: {
  dispatchResults?: DispatchTaskResult[];
  note: NotePayload;
  syncedTaskIds?: string[];
  tasks: TaskPayload[];
  waveKind: TaskWorkflowWaveKind;
}): TaskWorkflowWaveResult {
  const { gateTasks, implementTasks } = partitionWaveTasks(input.tasks);
  const waveTasks =
    input.waveKind === 'gate' ? gateTasks : implementTasks;
  const dispatchResults = input.dispatchResults ?? [];
  const dispatchedTaskIds = dispatchResults
    .filter((result) => result.dispatched)
    .map((result) => result.task.id);
  const blockedTaskIds = dispatchResults
    .filter((result) => !result.dispatched)
    .map((result) => result.task.id);
  const completedTaskIds = waveTasks
    .filter((task) => task.status === 'COMPLETED')
    .map((task) => task.id);
  const readyTaskIds = waveTasks
    .filter((task) => task.status === 'READY')
    .map((task) => task.id);
  const pendingTaskIds = waveTasks
    .filter((task) => {
      return (
        task.status !== 'COMPLETED' &&
        !dispatchedTaskIds.includes(task.id) &&
        !blockedTaskIds.includes(task.id)
      );
    })
    .map((task) => task.id);

  return {
    blockedTaskIds,
    completedTaskIds,
    delegationGroupId: buildDelegationGroupId(input.note.id),
    dispatchResults,
    dispatchedTaskIds,
    gateTaskIds: gateTasks.map((task) => task.id),
    pendingTaskIds,
    readyTaskIds,
    requiresGate:
      gateTasks.length > 0 &&
      implementTasks.length > 0 &&
      implementTasks.every((task) => task.status === 'COMPLETED'),
    scope: {
      noteId: input.note.id,
      projectId: input.note.projectId,
      sessionId: input.note.sessionId,
    },
    syncedTaskIds: input.syncedTaskIds ?? [],
    waveId: buildWaveId(input.note.id, input.waveKind),
    waveKind: input.waveKind,
  };
}

export function createTaskWorkflowOrchestrator(
  dependencies: TaskWorkflowOrchestratorDependencies,
): TaskWorkflowOrchestrator {
  const callbacks = dependencies.executionRuntime;

  return {
    async dispatchReadyTasks(
      projectId: string,
      options: DispatchReadyTasksOptions = {},
    ) {
      const { dispatchTasks } = await import('./task-dispatch-service.js');

      return await dispatchTasks(
        dependencies.sqlite,
        callbacks,
        {
          callerSessionId: options.callerSessionId,
          limit: options.limit,
          projectId,
        },
        {
          logger: options.logger ?? dependencies.logger,
          source: options.source,
        },
      );
    },
    async syncSpecAndDispatchReadyTasks(
      options: SyncSpecAndDispatchReadyTasksOptions,
    ) {
      const note = await resolveWorkflowSpecNote(
        dependencies.sqlite,
        options,
      );
      const taskSync = await syncSpecNoteToTasks(dependencies.sqlite, note);
      const tasks = await listSpecNoteTasks(dependencies.sqlite, note.id);
      const { implementTasks } = partitionWaveTasks(tasks);
      const readyTasks = await readyWaveTasks(
        dependencies.sqlite,
        implementTasks,
      );
      const dispatchResults = await dispatchWaveTasks(
        dependencies.sqlite,
        callbacks,
        readyTasks.slice(0, options.limit ?? readyTasks.length),
        options,
      );
      const refreshedTasks = await listSpecNoteTasks(dependencies.sqlite, note.id);

      return {
        ...buildWaveResult({
          dispatchResults,
          note,
          syncedTaskIds: taskSync.tasks.map((task) => task.taskId),
          tasks: refreshedTasks,
          waveKind: 'implement',
        }),
        taskSync,
      };
    },
    async resumeDelegationGroup(
      options: ResumeDelegationGroupOptions,
    ) {
      const note = await resolveWorkflowSpecNote(
        dependencies.sqlite,
        options,
      );
      const tasks = await listSpecNoteTasks(dependencies.sqlite, note.id);
      const { implementTasks } = partitionWaveTasks(tasks);
      const waveKind = implementTasks.every((task) => task.status === 'COMPLETED')
        ? 'gate'
        : 'implement';

      return buildWaveResult({
        note,
        tasks,
        waveKind,
      });
    },
    async dispatchGateTasksForCompletedWave(
      options: SyncSpecAndDispatchReadyTasksOptions,
    ) {
      const note = await resolveWorkflowSpecNote(
        dependencies.sqlite,
        options,
      );
      const tasks = await listSpecNoteTasks(dependencies.sqlite, note.id);
      const { gateTasks, implementTasks } = partitionWaveTasks(tasks);

      if (
        implementTasks.length === 0 ||
        !implementTasks.every((task) => task.status === 'COMPLETED')
      ) {
        throwGateWaveNotReady(note.projectId, note.id);
      }

      const readyTasks = await readyWaveTasks(dependencies.sqlite, gateTasks);
      const dispatchResults = await dispatchWaveTasks(
        dependencies.sqlite,
        callbacks,
        readyTasks.slice(0, options.limit ?? readyTasks.length),
        options,
      );
      const refreshedTasks = await listSpecNoteTasks(dependencies.sqlite, note.id);

      return buildWaveResult({
        dispatchResults,
        note,
        tasks: refreshedTasks,
        waveKind: 'gate',
      });
    },
    async executeTask(taskId: string, options: TaskWorkflowExecutionOptions = {}) {
      return await executeTaskWithCallbacks(dependencies.sqlite, taskId, {
        callbacks,
        callerSessionId: options.callerSessionId,
        logger: options.logger ?? dependencies.logger,
        retryOfRunId: options.retryOfRunId,
        source: options.source,
      });
    },
    async maybeAutoExecutePatchedTask(
      task: TaskPayload,
      patch: AutoExecuteTaskPatch,
      options: TaskWorkflowExecutionOptions = {},
    ) {
      return await maybeAutoExecutePatchedTaskWithCallbacks(
        dependencies.sqlite,
        task,
        patch,
        {
          callbacks,
          callerSessionId: options.callerSessionId,
          logger: options.logger ?? dependencies.logger,
          retryOfRunId: options.retryOfRunId,
          source: options.source,
        },
      );
    },
    async patchTaskAndMaybeExecute(
      taskId: string,
      patch: AutoExecuteTaskPatch,
      options: TaskWorkflowExecutionOptions = {},
    ) {
      return await patchTaskAndMaybeExecuteWithCallbacks(
        dependencies.sqlite,
        {
          callbacks,
          callerSessionId: options.callerSessionId,
          logger: options.logger ?? dependencies.logger,
          retryOfRunId: options.retryOfRunId,
          source: options.source,
          taskId,
        },
        patch,
      );
    },
    async patchTaskFromMcpAndMaybeExecute(
      taskId: string,
      patch: AutoExecuteTaskPatch,
      options: TaskWorkflowExecutionOptions = {},
    ) {
      return await patchTaskFromMcpAndMaybeExecuteWithCallbacks(
        dependencies.sqlite,
        {
          callbacks,
          callerSessionId: options.callerSessionId,
          logger: options.logger ?? dependencies.logger,
          retryOfRunId: options.retryOfRunId,
          source: options.source,
          taskId,
        },
        patch,
      );
    },
    async retryTaskRun(
      taskRunId: string,
      options: Omit<
        TaskWorkflowExecutionOptions,
        'callerSessionId' | 'retryOfRunId'
      > = {},
    ) {
      const { getLatestTaskRunByTaskId, getRetryableTaskRunById } =
        await import('./task-run-service.js');
      const sourceRun = await getRetryableTaskRunById(
        dependencies.sqlite,
        taskRunId,
      );
      const sourceSession = sourceRun.sessionId
        ? await getAcpSessionById(dependencies.sqlite, sourceRun.sessionId)
        : null;
      const executionSessionId =
        sourceSession?.parentSession?.id ?? sourceSession?.id ?? null;

      if (!executionSessionId) {
        throwTaskRunRetrySessionMissing(taskRunId);
      }

      const result = await executeTaskWithCallbacks(
        dependencies.sqlite,
        sourceRun.taskId,
        {
          callbacks,
          callerSessionId: executionSessionId,
          logger: options.logger ?? dependencies.logger,
          retryOfRunId: sourceRun.id,
          source: options.source,
        },
      );

      if (!result.dispatch.attempted || !result.dispatch.result?.dispatched) {
        throwTaskRunRetryDispatchBlocked(
          taskRunId,
          result.dispatch.errorMessage ??
            `Task run ${taskRunId} could not be retried`,
        );
      }

      const retriedRun = await getLatestTaskRunByTaskId(
        dependencies.sqlite,
        sourceRun.taskId,
      );

      if (
        !retriedRun ||
        retriedRun.id === sourceRun.id ||
        retriedRun.retryOfRunId !== sourceRun.id
      ) {
        throwTaskRunRetryNotCreated(taskRunId);
      }

      return retriedRun;
    },
  };
}
