import { request as httpRequest } from 'node:http';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import desktopCorsPlugin from '../plugins/desktop-cors';
import messageStreamPlugin from '../plugins/message-stream';
import messagesRoute from './messages';

describe('messages stream route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('includes desktop CORS headers on streamed responses', async () => {
    const fastify = Fastify();
    fastifyInstances.push(fastify);

    await fastify.register(desktopCorsPlugin);
    await fastify.register(messageStreamPlugin);
    await fastify.register(messagesRoute, { prefix: '/api' });
    await fastify.listen({ host: '127.0.0.1', port: 0 });

    const address = fastify.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('无法解析测试服务器地址');
    }

    const response = await new Promise<{
      headers: Record<string, string | string[] | undefined>;
      statusCode?: number;
      destroy: () => void;
    }>((resolve, reject) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port: address.port,
          path: '/api/conversations/conversation-1/stream',
          method: 'GET',
          headers: {
            Origin: 'http://localhost:4200',
          },
        },
        (streamResponse) => {
          resolve({
            headers: streamResponse.headers,
            statusCode: streamResponse.statusCode,
            destroy: () => streamResponse.destroy(),
          });
        },
      );

      request.on('error', reject);
      request.end();
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:4200',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['content-type']).toBe('text/event-stream');

    response.destroy();
  });
});
