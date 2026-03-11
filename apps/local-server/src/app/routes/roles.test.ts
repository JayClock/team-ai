import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import problemJsonPlugin from '../plugins/problem-json';
import rolesRoute from './roles';

describe('roles routes', () => {
  it('lists routa core roles', async () => {
    const fastify = Fastify();
    await fastify.register(problemJsonPlugin);
    await fastify.register(rolesRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/roles',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      _embedded: {
        roles: [
          expect.objectContaining({ id: 'ROUTA' }),
          expect.objectContaining({ id: 'CRAFTER' }),
          expect.objectContaining({ id: 'GATE' }),
          expect.objectContaining({ id: 'DEVELOPER' }),
        ],
      },
    });

    await fastify.close();
  });

  it('returns a single role', async () => {
    const fastify = Fastify();
    await fastify.register(problemJsonPlugin);
    await fastify.register(rolesRoute, { prefix: '/api' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/roles/GATE',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'GATE',
      name: 'Gate Reviewer',
    });

    await fastify.close();
  });
});
