import type { Database } from 'better-sqlite3';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDrizzleDb } from '../db/drizzle';
import { projectTasksTable } from '../db/schema';
import type { TaskKind } from '../schemas/task';
import { ensureDefaultKanbanBoard } from './kanban-board-service';
import { createKanbanCard, moveKanbanCard } from './kanban-card-service';
import { getTaskById, updateTask } from './task-service';

interface ExternalKanbanCardInput {
  githubNumber?: number | null;
  githubRepo?: string | null;
  githubState?: string | null;
  githubUrl?: string | null;
  kind?: TaskKind | null;
  labels?: string[];
  objective: string;
  projectId: string;
  sourceEventId: string;
  sourceType: string;
  stage: 'backlog' | 'blocked' | 'done' | 'review';
  title: string;
}

function findTaskByExternalRef(
  sqlite: Database,
  projectId: string,
  sourceType: string,
  sourceEventId: string,
) {
  return getDrizzleDb(sqlite)
    .select({
      id: projectTasksTable.id,
    })
    .from(projectTasksTable)
    .where(
      and(
        eq(projectTasksTable.projectId, projectId),
        eq(projectTasksTable.sourceType, sourceType),
        eq(projectTasksTable.sourceEventId, sourceEventId),
        isNull(projectTasksTable.deletedAt),
      ),
    )
    .orderBy(desc(projectTasksTable.updatedAt), desc(projectTasksTable.createdAt))
    .limit(1)
    .get() as { id: string } | undefined;
}

function mergeLabels(current: string[], next: string[]) {
  return [...new Set([...current, ...next])];
}

export async function upsertExternalKanbanCard(
  sqlite: Database,
  input: ExternalKanbanCardInput,
) {
  const board = await ensureDefaultKanbanBoard(sqlite, input.projectId);
  const targetColumn =
    board.columns.find((column) => column.stage === input.stage) ??
    board.columns[0];
  if (!targetColumn) {
    return null;
  }

  const labels = mergeLabels(
    [],
    [`trigger:${input.sourceType}`, ...(input.labels ?? [])],
  );
  const existing = findTaskByExternalRef(
    sqlite,
    input.projectId,
    input.sourceType,
    input.sourceEventId,
  );

  if (!existing) {
    return createKanbanCard(sqlite, {
      boardId: board.id,
      columnId: targetColumn.id,
      githubNumber: input.githubNumber,
      githubRepo: input.githubRepo,
      githubState: input.githubState,
      githubSyncedAt: new Date().toISOString(),
      githubUrl: input.githubUrl,
      kind: input.kind ?? null,
      labels,
      objective: input.objective,
      projectId: input.projectId,
      sourceEventId: input.sourceEventId,
      sourceType: input.sourceType,
      title: input.title,
    });
  }

  const currentTask = await getTaskById(sqlite, existing.id);
  const movedTask =
    currentTask.boardId !== board.id || currentTask.columnId !== targetColumn.id
      ? await moveKanbanCard(sqlite, {
          boardId: board.id,
          columnId: targetColumn.id,
          taskId: currentTask.id,
        })
      : currentTask;

  return updateTask(sqlite, movedTask.id, {
    githubNumber: input.githubNumber,
    githubRepo: input.githubRepo,
    githubState: input.githubState,
    githubSyncedAt: new Date().toISOString(),
    githubUrl: input.githubUrl,
    kind: input.kind ?? movedTask.kind,
    labels: mergeLabels(movedTask.labels, labels),
    objective: input.objective,
    sourceEventId: input.sourceEventId,
    sourceType: input.sourceType,
    title: input.title,
  });
}
