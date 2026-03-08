import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presentProject, presentProjectList } from '../presenters/project-presenter';
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProject,
} from '../services/project-service';

const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
});

const createProjectBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

const updateProjectBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional().nullable(),
  })
  .refine(
    (value) => value.title !== undefined || value.description !== undefined,
    'At least one field must be provided',
  );

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const projectsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects', async (request) => {
    const query = listProjectsQuerySchema.parse(request.query);

    return presentProjectList(await listProjects(fastify.sqlite, query));
  });

  fastify.post('/projects', async (request, reply) => {
    const body = createProjectBodySchema.parse(request.body);
    const project = await createProject(fastify.sqlite, body);

    reply.code(201).header('Location', `/api/projects/${project.id}`);

    return presentProject(project);
  });

  fastify.get('/projects/:projectId', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    return presentProject(await getProjectById(fastify.sqlite, projectId));
  });

  fastify.patch('/projects/:projectId', async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = updateProjectBodySchema.parse(request.body);

    return presentProject(await updateProject(fastify.sqlite, projectId, body));
  });

  fastify.delete('/projects/:projectId', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    await deleteProject(fastify.sqlite, projectId);
    reply.code(204).send();
  });
};

export default projectsRoute;
