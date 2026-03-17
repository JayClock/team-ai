import {
  reportToParentArgsSchema,
  taskGetArgsSchema,
  taskRunsListArgsSchema,
  tasksListArgsSchema,
  taskUpdateArgsSchema,
} from '../contracts';
import {
  createReportToParentHandler,
  createTaskGetHandler,
  createTaskRunsListHandler,
  createTasksListHandler,
  createTaskUpdateHandler,
} from '../tool-handlers';
import { defineToolRegistration } from './types';

export const taskToolCatalog = [
  defineToolRegistration(
    'tasks_list',
    tasksListArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description: 'List project tasks available in the local desktop runtime.',
      title: 'List Tasks',
    },
    createTasksListHandler,
  ),
  defineToolRegistration(
    'task_get',
    taskGetArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description: 'Get a single project task by id from the local desktop runtime.',
      title: 'Get Task',
    },
    createTaskGetHandler,
  ),
  defineToolRegistration(
    'task_update',
    taskUpdateArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Update safe task fields and controlled task statuses in the local desktop runtime.',
      title: 'Update Task',
    },
    createTaskUpdateHandler,
  ),
  defineToolRegistration(
    'task_runs_list',
    taskRunsListArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description:
        'List project task runs, with optional task, session, and status filters.',
      title: 'List Task Runs',
    },
    createTaskRunsListHandler,
  ),
  defineToolRegistration(
    'report_to_parent',
    reportToParentArgsSchema,
    {
      access: 'write',
      annotations: {
        readOnlyHint: false,
      },
      description:
        'Persist a delegated child session report back into shared task and note state for the parent workflow.',
      title: 'Report To Parent',
    },
    createReportToParentHandler,
  ),
] as const;
