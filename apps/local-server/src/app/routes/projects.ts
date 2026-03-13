import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  presentProject,
  presentProjectList,
} from '../presenters/project-presenter';
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProject,
} from '../services/project-service';
import { cloneProjectRepository as cloneProjectRepositoryFromGit } from '../services/project-repository-service';
import { setVendorMediaType, VENDOR_MEDIA_TYPES } from '../vendor-media-types';

const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
  repoPath: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
});

const createProjectBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  repoPath: z.string().trim().min(1).optional(),
  sourceType: z.enum(['github', 'local']).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
});

const cloneProjectBodySchema = z.object({
  description: z.string().trim().optional(),
  repositoryUrl: z.string().trim().min(1),
  title: z.string().trim().optional(),
});

const updateProjectBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional().nullable(),
    repoPath: z.string().trim().min(1).optional().nullable(),
    sourceType: z.enum(['github', 'local']).optional().nullable(),
    sourceUrl: z.string().trim().min(1).optional().nullable(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.repoPath !== undefined ||
      value.sourceType !== undefined ||
      value.sourceUrl !== undefined,
    'At least one field must be provided',
  );

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const projectsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects', async (request, reply) => {
    const query = listProjectsQuerySchema.parse(request.query);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.projects);

    return presentProjectList(await listProjects(fastify.sqlite, query));
  });

  fastify.post('/projects', async (request, reply) => {
    const body = createProjectBodySchema.parse(request.body);
    const project = await createProject(fastify.sqlite, body);

    reply
      .code(201)
      .header('Location', `/api/projects/${project.id}`)
      .type(VENDOR_MEDIA_TYPES.project);

    return presentProject(project);
  });

  fastify.post('/projects/clone', async (request, reply) => {
    const body = cloneProjectBodySchema.parse(request.body);
    const result = await cloneProjectRepositoryFromGit(fastify.sqlite, body);

    reply
      .code(result.cloneStatus === 'cloned' ? 201 : 200)
      .header('Location', `/api/projects/${result.project.id}`)
      .type(VENDOR_MEDIA_TYPES.project);

    return {
      cloneStatus: result.cloneStatus,
      ...presentProject(result.project),
    };
  });

  fastify.get('/projects/:projectId', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.project);

    return presentProject(await getProjectById(fastify.sqlite, projectId));
  });

  fastify.patch('/projects/:projectId', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = updateProjectBodySchema.parse(request.body);

    setVendorMediaType(reply, VENDOR_MEDIA_TYPES.project);

    return presentProject(await updateProject(fastify.sqlite, projectId, body));
  });

  fastify.delete('/projects/:projectId', async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    await deleteProject(fastify.sqlite, projectId);
    reply.code(204).send();
  });
};

export default projectsRoute;
