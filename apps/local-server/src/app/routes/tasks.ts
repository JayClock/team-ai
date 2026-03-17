import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentOrchestrationSummary } from '../presenters/orchestration-presenter';
import { presentTask, presentTaskList } from '../presenters/task-presenter';
import { listAcpSessionsByProject } from '../services/acp-service';
import { getDelegationGroupProgress } from '../services/delegation-group-service';
import { listTaskRuns } from '../services/task-run-service';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
} from '../services/task-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
});

const orchestrationSummaryQuerySchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
});

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const taskParamsSchema = z.object({
  taskId: z.string().min(1),
});

const taskExecuteBodySchema = z.object({
  callerSessionId: z.string().trim().min(1).optional(),
});

const nullableStringSchema = z.union([z.string().trim().min(1), z.null()]);
const stringArraySchema = z.array(z.string().trim().min(1));
const nullableTaskKindSchema = z.union([
  z.enum(['plan', 'implement', 'review', 'verify']),
  z.null(),
]);

const taskBodySchema = z.object({
  acceptanceCriteria: stringArraySchema.optional(),
  assignedProvider: nullableStringSchema.optional(),
  assignedRole: nullableStringSchema.optional(),
  assignedSpecialistId: nullableStringSchema.optional(),
  assignedSpecialistName: nullableStringSchema.optional(),
  assignee: nullableStringSchema.optional(),
  boardId: nullableStringSchema.optional(),
  codebaseId: nullableStringSchema.optional(),
  columnId: nullableStringSchema.optional(),
  completionSummary: nullableStringSchema.optional(),
  dependencies: stringArraySchema.optional(),
  githubId: nullableStringSchema.optional(),
  githubNumber: z.number().int().optional().nullable(),
  githubRepo: nullableStringSchema.optional(),
  githubState: nullableStringSchema.optional(),
  githubSyncedAt: nullableStringSchema.optional(),
  githubUrl: nullableStringSchema.optional(),
  kind: nullableTaskKindSchema.optional(),
  labels: stringArraySchema.optional(),
  lastSyncError: nullableStringSchema.optional(),
  objective: z.string().trim().min(1),
  parallelGroup: nullableStringSchema.optional(),
  parentTaskId: nullableStringSchema.optional(),
  position: z.number().int().optional().nullable(),
  priority: nullableStringSchema.optional(),
  scope: nullableStringSchema.optional(),
  status: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  sessionId: z.union([z.string().trim().min(1), z.null()]).optional(),
  verificationCommands: stringArraySchema.optional(),
  verificationReport: nullableStringSchema.optional(),
  verificationVerdict: nullableStringSchema.optional(),
  worktreeId: nullableStringSchema.optional(),
});

const taskPatchSchema = z
  .object({
    acceptanceCriteria: stringArraySchema.optional(),
    assignedProvider: nullableStringSchema.optional(),
    assignedRole: nullableStringSchema.optional(),
    assignedSpecialistId: nullableStringSchema.optional(),
    assignedSpecialistName: nullableStringSchema.optional(),
    assignee: nullableStringSchema.optional(),
    boardId: nullableStringSchema.optional(),
    codebaseId: nullableStringSchema.optional(),
    columnId: nullableStringSchema.optional(),
    completionSummary: nullableStringSchema.optional(),
    dependencies: stringArraySchema.optional(),
    githubId: nullableStringSchema.optional(),
    githubNumber: z.number().int().optional().nullable(),
    githubRepo: nullableStringSchema.optional(),
    githubState: nullableStringSchema.optional(),
    githubSyncedAt: nullableStringSchema.optional(),
    githubUrl: nullableStringSchema.optional(),
    kind: nullableTaskKindSchema.optional(),
    labels: stringArraySchema.optional(),
    lastSyncError: nullableStringSchema.optional(),
    objective: z.string().trim().min(1).optional(),
    parallelGroup: nullableStringSchema.optional(),
    parentTaskId: nullableStringSchema.optional(),
    position: z.number().int().optional().nullable(),
    priority: nullableStringSchema.optional(),
    scope: nullableStringSchema.optional(),
    status: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    verificationCommands: stringArraySchema.optional(),
    verificationReport: nullableStringSchema.optional(),
    verificationVerdict: nullableStringSchema.optional(),
    worktreeId: nullableStringSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

function resolveRootSessionId(
  sessions: Array<{
    id: string;
    parentSession: { id: string } | null;
  }>,
  focusSessionId: string | null,
) {
  if (!focusSessionId) {
    return sessions.find((session) => !session.parentSession)?.id ?? null;
  }

  const parentById = new Map(
    sessions.map((session) => [session.id, session.parentSession?.id ?? null]),
  );
  const visited = new Set<string>();
  let currentId: string | null = focusSessionId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parentId = parentById.get(currentId) ?? null;

    if (!parentId) {
      return currentId;
    }

    currentId = parentId;
  }

  return focusSessionId;
}

function collectSessionSubtreeIds(
  sessions: Array<{
    id: string;
    parentSession: { id: string } | null;
  }>,
  rootSessionId: string | null,
) {
  if (!rootSessionId) {
    return new Set(sessions.map((session) => session.id));
  }

  const childrenByParent = new Map<string | null, string[]>();

  for (const session of sessions) {
    const parentId = session.parentSession?.id ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(session.id);
    childrenByParent.set(parentId, siblings);
  }

  const included = new Set<string>();
  const queue = [rootSessionId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || included.has(currentId)) {
      continue;
    }

    included.add(currentId);
    for (const childId of childrenByParent.get(currentId) ?? []) {
      queue.push(childId);
    }
  }

  return included;
}

function buildSessionTreeSummary(
  sessions: Array<{
    id: string;
    parentSession: { id: string } | null;
    task: { id: string } | null;
  }>,
) {
  const childrenByParent = new Map<string | null, string[]>();

  for (const session of sessions) {
    const parentId = session.parentSession?.id ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(session.id);
    childrenByParent.set(parentId, siblings);
  }

  return sessions.map((session) => ({
    childSessionIds: childrenByParent.get(session.id) ?? [],
    parentSessionId: session.parentSession?.id ?? null,
    sessionId: session.id,
    taskId: session.task?.id ?? null,
  }));
}

function listProjectDelegationGroupIds(
  sqlite: Parameters<typeof listTasks>[0],
  projectId: string,
) {
  return (
    sqlite
      .prepare(
        `
          SELECT id
          FROM project_delegation_groups
          WHERE project_id = ?
          ORDER BY created_at ASC
        `,
      )
      .all(projectId) as Array<{ id: string }>
  ).map((row) => row.id);
}

const tasksRoute: FastifyPluginAsync = async (fastify) => {
  const workflow = fastify.taskWorkflowOrchestrator;

  fastify.get('/tasks', async (request, reply) => {
    const query = listTasksQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.tasks);

    return presentTaskList(await listTasks(fastify.sqlite, query));
  });

  fastify.get('/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = listTasksQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.tasks);

    return presentTaskList(
      await listTasks(fastify.sqlite, {
        ...query,
        projectId,
      }),
    );
  });

  fastify.get(
    '/projects/:projectId/orchestration-summary',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const query = orchestrationSummaryQuerySchema.parse(request.query);
      const focusSessionId = query.sessionId ?? null;
      const sessionList = await listAcpSessionsByProject(fastify.sqlite, projectId, {
        page: 1,
        pageSize: 500,
      });
      const rootSessionId = resolveRootSessionId(
        sessionList.items,
        focusSessionId,
      );
      const includedSessionIds = collectSessionSubtreeIds(
        sessionList.items,
        rootSessionId,
      );
      const sessions = sessionList.items.filter((session) =>
        includedSessionIds.has(session.id),
      );
      const taskList = await listTasks(fastify.sqlite, {
        page: 1,
        pageSize: 500,
        projectId,
      });
      const tasks = taskList.items.filter((task) => {
        if (!focusSessionId) {
          return true;
        }

        return (
          (task.sessionId && includedSessionIds.has(task.sessionId)) ||
          (task.executionSessionId &&
            includedSessionIds.has(task.executionSessionId)) ||
          (task.resultSessionId && includedSessionIds.has(task.resultSessionId))
        );
      });
      const taskIds = new Set(tasks.map((task) => task.id));
      const taskRunList = await listTaskRuns(fastify.sqlite, {
        page: 1,
        pageSize: 500,
        projectId,
      });
      const taskRuns = taskRunList.items.filter((taskRun) => {
        if (!focusSessionId) {
          return true;
        }

        return (
          taskIds.has(taskRun.taskId) ||
          (taskRun.sessionId && includedSessionIds.has(taskRun.sessionId))
        );
      });
      const delegationGroups = (
        await Promise.all(
          listProjectDelegationGroupIds(fastify.sqlite, projectId).map(
            async (groupId) =>
              await getDelegationGroupProgress(fastify.sqlite, {
                groupId,
                projectId,
              }),
          ),
        )
      ).filter((group) => {
        if (!focusSessionId) {
          return true;
        }

        return (
          group.taskIds.some((taskId) => taskIds.has(taskId)) ||
          group.sessionIds.some((sessionId) => includedSessionIds.has(sessionId)) ||
          (group.parentSessionId &&
            includedSessionIds.has(group.parentSessionId))
        );
      });

      setVendorMediaType(reply, VENDOR_MEDIA_TYPES.orchestrationSummary);

      return presentOrchestrationSummary({
        delegationGroups,
        focusSessionId,
        projectId,
        rootSessionId,
        sessionTree: buildSessionTreeSummary(sessions),
        sessions,
        taskRuns,
        tasks,
      });
    },
  );

  fastify.post(
    '/projects/:projectId/tasks',
    async (request, reply) => {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = taskBodySchema.parse(request.body);
      const { sessionId, ...taskInput } = body;
      const task = await createTask(fastify.sqlite, {
        ...taskInput,
        projectId,
        sessionId,
      });

      reply
        .code(201)
        .header('Location', `/api/tasks/${task.id}`)
        .type(VENDOR_MEDIA_TYPES.task);
      return presentTask(task);
    },
  );

  fastify.get('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(await getTaskById(fastify.sqlite, taskId));
  });

  fastify.patch('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = taskPatchSchema.parse(request.body);
    const executedTask = await workflow.patchTaskAndMaybeExecute(
      taskId,
      body,
      {
        logger: request.log,
        source: 'tasks_route_patch_auto_execute',
      },
    );

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(executedTask);
  });

  fastify.post('/tasks/:taskId/execute', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = taskExecuteBodySchema.parse(request.body ?? {});
    const result = await workflow.executeTask(taskId, {
      callerSessionId: body.callerSessionId,
      logger: request.log,
      source: 'tasks_route_execute',
    });

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.task);

    return presentTask(result.task);
  });

  fastify.delete('/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParamsSchema.parse(request.params);
    await deleteTask(fastify.sqlite, taskId);
    reply.code(204).send();
  });
};

export default tasksRoute;
