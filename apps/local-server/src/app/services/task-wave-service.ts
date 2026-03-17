import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import type { NotePayload } from '../schemas/note';
import type { TaskKind, TaskPayload } from '../schemas/task';
import type { DiagnosticLogger } from '../diagnostics';
import type {
  TaskSessionDispatchCallbacks,
  TaskSessionDispatchResult,
} from './task-session-dispatch-service';
import { dispatchTaskSessions } from './task-session-dispatch-service';
import { findSpecNoteByScope, getNoteById } from './note-service';
import { getTaskById, updateTask } from './task-service';

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
  dispatchResults: TaskSessionDispatchResult[];
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

export interface TaskWorkflowScopeInput {
  noteId?: string;
  projectId: string;
  sessionId?: string | null;
}

export interface TaskWaveExecutionOptions extends TaskWorkflowScopeInput {
  callerSessionId?: string;
  limit?: number;
  logger?: DiagnosticLogger;
  source?: string;
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

function throwGateWaveNotReady(projectId: string, noteId: string): never {
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

async function readyWaveTasks(sqlite: Database, tasks: TaskPayload[]) {
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
  callbacks: TaskSessionDispatchCallbacks,
  note: NotePayload,
  tasks: TaskPayload[],
  waveKind: TaskWorkflowWaveKind,
  options: TaskWaveExecutionOptions,
) {
  const readyTaskIds = tasks
    .filter((task) => task.status === 'READY')
    .map((task) => task.id);

  if (readyTaskIds.length === 0) {
    return [];
  }

  const result = await dispatchTaskSessions(
    sqlite,
    callbacks,
    {
      callerSessionId: options.callerSessionId,
      delegationGroupId: buildDelegationGroupId(note.id),
      limit: options.limit,
      projectId: note.projectId,
      taskIds: readyTaskIds,
      waveId: buildWaveId(note.id, waveKind),
    },
    {
      logger: options.logger,
      source: options.source,
    },
  );

  return result.results;
}

function buildWaveResult(input: {
  dispatchResults?: TaskSessionDispatchResult[];
  note: NotePayload;
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
    syncedTaskIds: [],
    waveId: buildWaveId(input.note.id, input.waveKind),
    waveKind: input.waveKind,
  };
}

export async function dispatchGateTasksForCompletedWave(
  sqlite: Database,
  callbacks: TaskSessionDispatchCallbacks,
  options: TaskWaveExecutionOptions,
) {
  const note = await resolveWorkflowSpecNote(sqlite, options);
  const tasks = await listSpecNoteTasks(sqlite, note.id);
  const { gateTasks, implementTasks } = partitionWaveTasks(tasks);

  if (
    implementTasks.length === 0 ||
    !implementTasks.every((task) => task.status === 'COMPLETED')
  ) {
    throwGateWaveNotReady(note.projectId, note.id);
  }

  const readyTasks = await readyWaveTasks(sqlite, gateTasks);
  const dispatchResults = await dispatchWaveTasks(
    sqlite,
    callbacks,
    note,
    readyTasks.slice(0, options.limit ?? readyTasks.length),
    'gate',
    options,
  );
  const refreshedTasks = await listSpecNoteTasks(sqlite, note.id);

  return buildWaveResult({
    dispatchResults,
    note,
    tasks: refreshedTasks,
    waveKind: 'gate',
  });
}
