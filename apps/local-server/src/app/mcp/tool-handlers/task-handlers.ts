import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getProjectById } from '../../services/project-service';
import { reportToParent } from '../../services/task-report-service';
import { listTaskRuns } from '../../services/task-run-service';
import { listTasks } from '../../services/task-service';
import {
  reportToParentArgsSchema,
  taskExecuteArgsSchema,
  taskGetArgsSchema,
  taskRunsListArgsSchema,
  tasksListArgsSchema,
  taskUpdateArgsSchema,
} from '../contracts';
import {
  ensureDependencyTasksBelongToProject,
  getProjectSession,
  getProjectTask,
} from '../utils';

type TasksListArgs = z.infer<typeof tasksListArgsSchema>;
type TaskGetArgs = z.infer<typeof taskGetArgsSchema>;
type TaskUpdateArgs = z.infer<typeof taskUpdateArgsSchema>;
type TaskExecuteArgs = z.infer<typeof taskExecuteArgsSchema>;
type TaskRunsListArgs = z.infer<typeof taskRunsListArgsSchema>;
type ReportToParentArgs = z.infer<typeof reportToParentArgsSchema>;

export function createTasksListHandler(fastify: FastifyInstance) {
  return async (args: TasksListArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    if (args.sessionId) {
      await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);
    }

    return listTasks(fastify.sqlite, args);
  };
}

export function createTaskGetHandler(fastify: FastifyInstance) {
  return async (args: TaskGetArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);

    return {
      task: await getProjectTask(fastify.sqlite, args.projectId, args.taskId),
    };
  };
}

export function createTaskUpdateHandler(fastify: FastifyInstance) {
  return async (args: TaskUpdateArgs) => {
    const workflow = fastify.taskWorkflowOrchestrator;

    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectTask(fastify.sqlite, args.projectId, args.taskId);
    await ensureDependencyTasksBelongToProject(
      fastify.sqlite,
      args.projectId,
      args.dependencies,
    );

    const { projectId, taskId, ...patch } = args;
    void projectId;

    return {
      task: await workflow.patchTaskFromMcpAndMaybeExecute(taskId, patch, {
        logger: fastify.log,
        source: 'mcp_task_update_auto_execute',
      }),
    };
  };
}

export function createTaskExecuteHandler(fastify: FastifyInstance) {
  return async (args: TaskExecuteArgs) => {
    const workflow = fastify.taskWorkflowOrchestrator;

    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectTask(fastify.sqlite, args.projectId, args.taskId);

    return workflow.executeTask(args.taskId, {
      callerSessionId: args.callerSessionId,
      logger: fastify.log,
      source: 'mcp_task_execute',
    });
  };
}

export function createTaskRunsListHandler(fastify: FastifyInstance) {
  return async (args: TaskRunsListArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    if (args.taskId) {
      await getProjectTask(fastify.sqlite, args.projectId, args.taskId);
    }
    if (args.sessionId) {
      await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);
    }

    return listTaskRuns(fastify.sqlite, args);
  };
}

export function createReportToParentHandler(fastify: FastifyInstance) {
  return async (args: ReportToParentArgs) => {
    await getProjectById(fastify.sqlite, args.projectId);
    await getProjectSession(fastify.sqlite, args.projectId, args.sessionId);
    return reportToParent(fastify.sqlite, args);
  };
}
