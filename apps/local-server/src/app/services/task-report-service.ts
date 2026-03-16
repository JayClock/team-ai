import type { Database } from 'better-sqlite3';
import { ProblemError } from '../errors/problem-error';
import type { NotePayload, NoteType } from '../schemas/note';
import type { TaskRunPayload } from '../schemas/task-run';
import type { TaskPayload } from '../schemas/task';
import {
  getDelegationGroupProgress,
  synchronizeDelegationGroupState,
} from './delegation-group-service';
import { recordNoteEvent } from './note-event-service';
import {
  createNote,
  findLatestTaskNote,
  updateNote,
} from './note-service';
import { getLatestTaskRunByTaskId, updateTaskRun } from './task-run-service';
import { getTaskById, updateTask } from './task-service';

type ReportToParentVerdict = 'blocked' | 'completed' | 'fail' | 'pass';

interface SessionReportContextRow {
  id: string;
  parent_session_id: string | null;
  project_id: string;
  specialist_id: string | null;
  task_id: string | null;
}

interface ReportToParentInput {
  areasChanged?: string[];
  blocker?: string | null;
  filesChanged?: string[];
  projectId: string;
  residualRisk?: string | null;
  sessionId: string;
  summary: string;
  verificationPerformed?: string[];
  verdict: ReportToParentVerdict;
}

export interface ReportToParentResult {
  delegationGroup: {
    completedCount: number;
    failureCount: number;
    groupId: string;
    parentSessionId: string | null;
    pendingCount: number;
    sessionIds: string[];
    settled: boolean;
    status: 'OPEN' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    taskIds: string[];
    totalCount: number;
  } | null;
  note: NotePayload;
  noteAction: 'created' | 'updated';
  report: {
    mode: 'implementation' | 'verification';
    parentSessionId: string | null;
    taskId: string;
    verdict: ReportToParentVerdict;
  };
  task: TaskPayload;
  taskRun: TaskRunPayload | null;
}

function throwReportSessionNotFound(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/report-session-not-found',
    title: 'Report Session Not Found',
    status: 404,
    detail: `ACP session ${sessionId} was not found`,
    context: {
      sessionId,
    },
  });
}

function throwReportProjectMismatch(
  projectId: string,
  sessionId: string,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/report-project-mismatch',
    title: 'Report Project Mismatch',
    status: 409,
    detail: `ACP session ${sessionId} does not belong to project ${projectId}`,
    context: {
      projectId,
      sessionId,
    },
  });
}

function throwReportSessionContextMissing(sessionId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/report-session-context-missing',
    title: 'Report Session Context Missing',
    status: 409,
    detail:
      `ACP session ${sessionId} is not a delegated child session with a bound task`,
    context: {
      sessionId,
    },
  });
}

function throwImplementationVerdictInvalid(
  taskId: string,
  verdict: ReportToParentVerdict,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/report-implementation-verdict-invalid',
    title: 'Implementation Report Verdict Invalid',
    status: 400,
    detail:
      `Task ${taskId} accepts implementation verdicts completed|blocked, received ${verdict}`,
    context: {
      taskId,
      verdict,
    },
  });
}

function throwVerificationVerdictInvalid(
  taskId: string,
  verdict: ReportToParentVerdict,
): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/report-verification-verdict-invalid',
    title: 'Verification Report Verdict Invalid',
    status: 400,
    detail: `Task ${taskId} accepts verification verdicts pass|fail, received ${verdict}`,
    context: {
      taskId,
      verdict,
    },
  });
}

function getSessionReportContext(
  sqlite: Database,
  sessionId: string,
): SessionReportContextRow {
  const row = sqlite
    .prepare(
      `
        SELECT
          id,
          project_id,
          parent_session_id,
          specialist_id,
          task_id
        FROM project_acp_sessions
        WHERE id = ? AND deleted_at IS NULL
      `,
    )
    .get(sessionId) as SessionReportContextRow | undefined;

  if (!row) {
    throwReportSessionNotFound(sessionId);
  }

  return row;
}

function isVerificationTask(task: Pick<TaskPayload, 'assignedRole' | 'kind'>) {
  return (
    task.assignedRole === 'GATE' ||
    task.kind === 'review' ||
    task.kind === 'verify'
  );
}

function buildReportLines(
  title: string,
  input: ReportToParentInput,
  context: {
    mode: 'implementation' | 'verification';
    specialistId: string | null;
  },
) {
  const lines = [`## ${title}`, '', `- Verdict: ${input.verdict}`, `- Summary: ${input.summary}`, `- Session: ${input.sessionId}`];

  if (context.specialistId) {
    lines.push(`- Specialist: ${context.specialistId}`);
  }

  if ((input.filesChanged ?? []).length > 0) {
    lines.push('', '### Files Changed', '');
    for (const file of input.filesChanged ?? []) {
      lines.push(`- ${file}`);
    }
  }

  if ((input.areasChanged ?? []).length > 0) {
    lines.push('', '### Areas Changed', '');
    for (const area of input.areasChanged ?? []) {
      lines.push(`- ${area}`);
    }
  }

  if ((input.verificationPerformed ?? []).length > 0) {
    lines.push('', '### Verification Performed', '');
    for (const item of input.verificationPerformed ?? []) {
      lines.push(`- ${item}`);
    }
  }

  if (input.blocker) {
    lines.push('', '### Blocker', '', input.blocker);
  }

  if (input.residualRisk) {
    lines.push('', '### Residual Risk', '', input.residualRisk);
  }

  if (
    context.mode === 'implementation' &&
    !input.blocker &&
    !input.residualRisk &&
    (input.verificationPerformed?.length ?? 0) === 0
  ) {
    lines.push('', '### Handoff', '', 'Ready for coordinator follow-up.');
  }

  return lines.join('\n');
}

function appendReportContent(
  currentContent: string,
  appendedSection: string,
): string {
  const trimmed = currentContent.trim();

  if (trimmed.length === 0) {
    return appendedSection;
  }

  return `${trimmed}\n\n---\n\n${appendedSection}`;
}

async function upsertReportNote(
  sqlite: Database,
  input: {
    content: string;
    mode: 'implementation' | 'verification';
    parentSessionId: string | null;
    projectId: string;
    source: NotePayload['source'];
    task: TaskPayload;
  },
): Promise<{
  note: NotePayload;
  noteAction: 'created' | 'updated';
}> {
  const noteType: NoteType =
    input.mode === 'implementation' ? 'task' : 'general';
  const title =
    input.mode === 'implementation'
      ? `Task Report: ${input.task.title}`
      : `Verification Report: ${input.task.title}`;
  const existing = await findLatestTaskNote(sqlite, {
    projectId: input.projectId,
    sessionId: input.parentSessionId,
    taskId: input.task.id,
    title,
    type: noteType,
  });

  const note = existing
    ? await updateNote(sqlite, existing.id, {
        content: appendReportContent(existing.content, input.content),
        linkedTaskId: input.task.id,
        sessionId: input.parentSessionId,
        source: input.source,
        title,
        type: noteType,
      })
    : await createNote(sqlite, {
        content: input.content,
        linkedTaskId: input.task.id,
        projectId: input.projectId,
        sessionId: input.parentSessionId,
        source: input.source,
        title,
        type: noteType,
      });

  await recordNoteEvent(sqlite, {
    note,
    type: existing ? 'updated' : 'created',
  });

  return {
    note,
    noteAction: existing ? 'updated' : 'created',
  };
}

async function syncTaskRunReport(
  sqlite: Database,
  input: {
    mode: 'implementation' | 'verification';
    sessionId: string;
    summary: string;
    task: TaskPayload;
    verificationReport: string;
    verdict: ReportToParentVerdict;
  },
) {
  const latestTaskRun = await getLatestTaskRunByTaskId(sqlite, input.task.id);

  if (!latestTaskRun || latestTaskRun.sessionId !== input.sessionId) {
    return null;
  }

  return await updateTaskRun(sqlite, latestTaskRun.id, {
    completedAt:
      input.verdict === 'completed' ||
      input.verdict === 'blocked' ||
      input.verdict === 'pass' ||
      input.verdict === 'fail'
        ? new Date().toISOString()
        : latestTaskRun.completedAt,
    status:
      input.mode === 'verification'
        ? input.verdict === 'pass'
          ? 'COMPLETED'
          : 'FAILED'
        : input.verdict === 'completed'
          ? 'COMPLETED'
          : 'FAILED',
    summary: input.summary,
    verificationReport: input.verificationReport,
    verificationVerdict:
      input.mode === 'verification'
        ? input.verdict === 'pass'
          ? 'pass'
          : 'fail'
        : input.verdict === 'completed'
          ? 'pass'
          : 'fail',
  });
}

export async function reportToParent(
  sqlite: Database,
  input: ReportToParentInput,
): Promise<ReportToParentResult> {
  const session = getSessionReportContext(sqlite, input.sessionId);

  if (session.project_id !== input.projectId) {
    throwReportProjectMismatch(input.projectId, input.sessionId);
  }

  if (!session.parent_session_id || !session.task_id) {
    throwReportSessionContextMissing(input.sessionId);
  }

  const task = await getTaskById(sqlite, session.task_id);
  const mode = isVerificationTask(task) ? 'verification' : 'implementation';

  if (mode === 'implementation') {
    if (input.verdict !== 'completed' && input.verdict !== 'blocked') {
      throwImplementationVerdictInvalid(task.id, input.verdict);
    }
  } else if (input.verdict !== 'pass' && input.verdict !== 'fail') {
    throwVerificationVerdictInvalid(task.id, input.verdict);
  }

  const verificationReport = buildReportLines(
    mode === 'implementation' ? 'Implementation Report' : 'Verification Report',
    input,
    {
      mode,
      specialistId: session.specialist_id,
    },
  );
  const noteResult = await upsertReportNote(sqlite, {
    content: verificationReport,
    mode,
    parentSessionId: session.parent_session_id,
    projectId: input.projectId,
    source: 'agent',
    task,
  });

  const updatedTask = await updateTask(sqlite, task.id, {
    completionSummary:
      mode === 'implementation' ? input.summary : task.completionSummary,
    executionSessionId: null,
    resultSessionId: session.id,
    status:
      mode === 'implementation'
        ? input.verdict === 'completed'
          ? 'COMPLETED'
          : 'WAITING_RETRY'
        : input.verdict === 'pass'
          ? 'COMPLETED'
          : 'WAITING_RETRY',
    verificationReport:
      mode === 'verification' ? verificationReport : task.verificationReport,
    verificationVerdict:
      mode === 'verification'
        ? input.verdict === 'pass'
          ? 'pass'
          : 'fail'
        : task.verificationVerdict,
  });
  const taskRun = await syncTaskRunReport(sqlite, {
    mode,
    sessionId: session.id,
    summary: input.summary,
    task: updatedTask,
    verificationReport,
    verdict: input.verdict,
  });
  let delegationGroup =
    updatedTask.parallelGroup === null
      ? null
      : await getDelegationGroupProgress(sqlite, {
          groupId: updatedTask.parallelGroup,
          projectId: updatedTask.projectId,
        });

  if (
    delegationGroup?.settled &&
    delegationGroup.status !== 'COMPLETED' &&
    delegationGroup.status !== 'FAILED'
  ) {
    const completedGroup = await synchronizeDelegationGroupState(sqlite, {
      groupId: delegationGroup.groupId,
      projectId: updatedTask.projectId,
    });
    delegationGroup = {
      ...delegationGroup,
      status: completedGroup.status,
      parentSessionId: completedGroup.parentSessionId,
      sessionIds: completedGroup.sessionIds,
      taskIds: completedGroup.taskIds,
    };
  }

  return {
    delegationGroup: delegationGroup
      ? {
          completedCount: delegationGroup.completedCount,
          failureCount: delegationGroup.failureCount,
          groupId: delegationGroup.groupId,
          parentSessionId: delegationGroup.parentSessionId,
          pendingCount: delegationGroup.pendingCount,
          sessionIds: delegationGroup.sessionIds,
          settled: delegationGroup.settled,
          status: delegationGroup.status,
          taskIds: delegationGroup.taskIds,
          totalCount: delegationGroup.totalCount,
        }
      : null,
    note: noteResult.note,
    noteAction: noteResult.noteAction,
    report: {
      mode,
      parentSessionId: session.parent_session_id,
      taskId: task.id,
      verdict: input.verdict,
    },
    task: updatedTask,
    taskRun,
  };
}
