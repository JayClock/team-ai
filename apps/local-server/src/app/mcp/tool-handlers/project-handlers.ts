import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listProjects } from '../../services/project-service';
import { projectsListArgsSchema } from '../contracts';

type ProjectsListArgs = z.infer<typeof projectsListArgsSchema>;

export function createProjectsListHandler(fastify: FastifyInstance) {
  return async (args: ProjectsListArgs) => listProjects(fastify.sqlite, args);
}
