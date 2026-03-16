import { projectsListArgsSchema } from '../contracts';
import { createProjectsListHandler } from '../tool-handlers';
import { defineToolRegistration } from './types';

export const projectToolCatalog = [
  defineToolRegistration(
    'projects_list',
    projectsListArgsSchema,
    {
      access: 'read',
      annotations: {
        idempotentHint: true,
        readOnlyHint: true,
      },
      description: 'List local desktop projects available in the current workspace.',
      title: 'List Projects',
    },
    createProjectsListHandler,
  ),
] as const;
