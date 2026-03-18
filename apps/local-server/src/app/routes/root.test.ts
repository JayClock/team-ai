import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import problemJsonPlugin from '../plugins/problem-json';
import { responseContentType } from '../test-support/response-content-type';
import { VENDOR_MEDIA_TYPES } from '../vendor-media-types';
import rootRoute from './root';

describe('root route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('exposes local-server discovery links without the legacy sessions collection', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(problemJsonPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api',
    });

    expect(response.statusCode).toBe(200);
    expect(responseContentType(response)).toBe(VENDOR_MEDIA_TYPES.root);
    expect(response.json()).toMatchObject({
      name: 'team-ai-local-server',
      capabilities: {
        acp: true,
        agents: true,
        mcp: true,
        settings: true,
        syncStatus: true,
      },
      _links: {
        self: {
          href: '/api',
        },
        projects: {
          href: '/api/projects',
        },
        agents: {
          href: '/api/projects/{projectId}/agents{?page,pageSize}',
          templated: true,
        },
        flows: {
          href: '/api/projects/{projectId}/flows',
          templated: true,
        },
        acp: {
          href: '/api/acp',
        },
        'acp-providers': {
          href: '/api/acp/providers{?registry}',
          templated: true,
        },
        'acp-runtime-sessions': {
          href: '/api/acp/runtime-sessions',
        },
        mcp: {
          href: '/api/mcp',
        },
      },
    });
    expect(response.json()._links.health).toBeUndefined();
    expect(response.json()._links.orchestration).toBeUndefined();
    expect(response.json()._links.sessions).toBeUndefined();
  });
});
