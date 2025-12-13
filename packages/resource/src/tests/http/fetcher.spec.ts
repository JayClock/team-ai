import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Fetcher } from '../../lib/http/fetcher.js';
import { Config } from '../../lib/archtype/config.js';
import { HttpError, Problem } from '../../lib/http/error.js';
import { SafeAny } from '../../lib/archtype/safe-any.js';

describe('Fetcher', () => {
  let fetcher: Fetcher;
  let mockConfig: Config;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockConfig = {
      baseURL: 'https://api.example.com',
      sendUserAgent: true,
    };

    mockFetch = vi.fn();
    global.fetch = mockFetch as SafeAny;

    fetcher = new Fetcher(mockConfig);
  });

  describe('constructor', () => {
    it('should create a fetcher instance with empty middlewares', () => {
      expect(fetcher.middlewares).toEqual([]);
    });
  });

  describe('use', () => {
    it('should add a middleware with default origin', () => {
      const middleware = vi.fn();
      fetcher.use(middleware);

      expect(fetcher.middlewares).toHaveLength(1);
      expect(fetcher.middlewares[0][0]).toBeInstanceOf(RegExp);
      expect(fetcher.middlewares[0][1]).toBe(middleware);
    });

    it('should add a middleware with specific origin', () => {
      const middleware = vi.fn();
      fetcher.use(middleware, 'https://api.example.com');

      expect(fetcher.middlewares).toHaveLength(1);
      expect(fetcher.middlewares[0][0]).toBeInstanceOf(RegExp);
      expect(fetcher.middlewares[0][1]).toBe(middleware);
    });

    it('should add a middleware with wildcard origin', () => {
      const middleware = vi.fn();
      fetcher.use(middleware, 'https://*.example.com');

      expect(fetcher.middlewares).toHaveLength(1);
      expect(fetcher.middlewares[0][0]).toBeInstanceOf(RegExp);
      expect(fetcher.middlewares[0][1]).toBe(middleware);
    });
  });

  describe('getMiddlewaresByOrigin', () => {
    beforeEach(() => {
      const middleware1 = vi.fn();
      const middleware2 = vi.fn();
      const middleware3 = vi.fn();

      fetcher.use(middleware1, 'https://api.example.com');
      fetcher.use(middleware2, 'https://*.example.com');
      fetcher.use(middleware3, '*');
    });

    it('should return middlewares that match the origin', () => {
      const middlewares = fetcher.getMiddlewaresByOrigin(
        'https://api.example.com',
      );
      expect(middlewares).toHaveLength(3);
    });

    it('should return middlewares that match the wildcard origin', () => {
      const middlewares = fetcher.getMiddlewaresByOrigin(
        'https://test.example.com',
      );
      expect(middlewares).toHaveLength(2); // wildcard and *.example.com
    });

    it('should return only the wildcard middleware for non-matching origins', () => {
      const middlewares = fetcher.getMiddlewaresByOrigin('https://other.com');
      expect(middlewares).toHaveLength(1); // only wildcard
    });
  });

  describe('fetchOrThrow', () => {
    it('should return response when response is ok', async () => {
      mockFetch.mockResolvedValue(
        new Response('test response', { status: 200 }),
      );

      const response = await fetcher.fetchOrThrow(
        'https://api.example.com/test',
      );

      expect(response).toBeInstanceOf(Response);
      expect(response.ok).toBe(true);
    });

    it('should throw HttpError when response is not ok and content-type is not problem+json', async () => {
      mockFetch.mockResolvedValue(
        new Response('error', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      await expect(
        fetcher.fetchOrThrow('https://api.example.com/test'),
      ).rejects.toThrow(HttpError);
    });

    it('should throw Problem when response is not ok and content-type is problem+json', async () => {
      const problemBody = {
        type: 'https://example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'The requested resource was not found',
      };

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(problemBody), {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      );

      await expect(
        fetcher.fetchOrThrow('https://api.example.com/test'),
      ).rejects.toThrow(Problem);
    });

    it('should throw Problem with default type when not provided', async () => {
      const problemBody = {
        title: 'Not Found',
        status: 404,
        detail: 'The requested resource was not found',
      };

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(problemBody), {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      );

      try {
        await fetcher.fetchOrThrow('https://api.example.com/test');
        expect.fail('Should have thrown a Problem');
      } catch (error) {
        expect(error).toBeInstanceOf(Problem);
        expect((error as Problem).body.type).toBe('about:blank');
      }
    });
  });
});
