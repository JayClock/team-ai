import { describe, expect, it, vi } from 'vitest';
import { basicAuth } from '../../lib/http/basic-auth.js';
import { bearerAuth } from '../../lib/http/bearer-auth.js';

describe('auth middlewares', () => {
  it('should set Authorization header for basic auth', async () => {
    const middleware = basicAuth('alice', 'secret');
    const request = new Request('https://api.example.com/resource');
    const next = vi.fn(async (req: Request) => {
      return new Response(req.headers.get('Authorization'));
    });

    const response = await middleware(request, next);

    expect(request.headers.get('Authorization')).toBe('Basic YWxpY2U6c2VjcmV0');
    expect(next).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('Basic YWxpY2U6c2VjcmV0');
  });

  it('should set Authorization header for bearer auth', async () => {
    const middleware = bearerAuth('token-123');
    const request = new Request('https://api.example.com/resource');
    const next = vi.fn(async (req: Request) => {
      return new Response(req.headers.get('Authorization'));
    });

    const response = await middleware(request, next);

    expect(request.headers.get('Authorization')).toBe('Bearer token-123');
    expect(next).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('Bearer token-123');
  });
});
