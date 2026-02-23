import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Fetcher } from '../../lib/http/fetcher.js';
import { Config } from '../../lib/archtype/config.js';
import { HttpError, Problem } from '../../lib/http/error.js';
import { SafeAny } from '../../lib/archtype/safe-any.js';
import { warningMiddleware } from '../../lib/middlewares/warning.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { acceptMiddleware } from '../../lib/middlewares/accept-header.js';
import { cacheMiddleware } from '../../lib/middlewares/cache.js';
import { State } from '../../lib/index.js';

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

  describe('middlewares', () => {
    it('should use warning middleware to console warning info', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      fetcher.use(warningMiddleware());

      mockFetch.mockResolvedValue(
        new Response('test response', {
          status: 200,
          headers: {
            Deprecation: 'true',
            Sunset: '2024-01-01',
            Link: '<https://example.com/deprecation-info>; rel="deprecation"',
          },
        }),
      );

      await fetcher.fetchOrThrow('https://api.example.com/test');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Resource] The resource https://api.example.com/test is deprecated. It will no longer respond 2024-01-01See https://example.com/deprecation-info for more information.',
      );

      consoleSpy.mockRestore();
    });

    it('should use header middleware to set accept header with content maps', async () => {
      const mockClient = {
        contentTypeMap: {
          'application/prs.hal-forms+json': ['halStateFactory', '1.0'],
          'application/hal+json': ['halStateFactory', '0.9'],
        },
      } as unknown as ClientInstance;

      fetcher.use(acceptMiddleware(mockClient));

      mockFetch.mockResolvedValue(
        new Response('test response', { status: 200 }),
      );

      await fetcher.fetchOrThrow('https://api.example.com/test');

      expect(mockFetch).toHaveBeenCalledWith(expect.any(Request));

      const request = mockFetch.mock.calls[0][0] as Request;
      expect(request.headers.get('Accept')).toBe(
        'application/prs.hal-forms+json;q=1.0, application/hal+json;q=0.9',
      );
    });

    it('should not clear cache with safe method', async () => {
      const mockClient = {
        clearResourceCache: vi.fn(),
      } as unknown as ClientInstance;

      fetcher.use(cacheMiddleware(mockClient));
      vi.clearAllMocks();
      mockFetch.mockResolvedValue(new Response('success', { status: 200 }));

      await fetcher.fetchOrThrow('https://api.example.com/resource', {
        method: 'GET',
      });

      expect(mockClient.clearResourceCache).not.toHaveBeenCalled();
    });

    it('should use cache middle ware to clear cache', async () => {
      const mockClient = {
        clearResourceCache: vi.fn(),
      } as unknown as ClientInstance;

      fetcher.use(cacheMiddleware(mockClient));

      mockFetch.mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: {
            Link: '</related-resource>; rel="invalidates"',
            Location: '/updated-resource',
          },
        }),
      );

      await fetcher.fetchOrThrow('https://api.example.com/resource', {
        method: 'DELETE',
      });

      expect(mockClient.clearResourceCache).toHaveBeenCalledWith(
        [
          'https://api.example.com/related-resource',
          'https://api.example.com/updated-resource',
        ],
        ['https://api.example.com/resource'],
      );
    });

    it('should skip stale event invalidation when no-stale request header is present', async () => {
      const mockClient = {
        clearResourceCache: vi.fn(),
      } as unknown as ClientInstance;

      fetcher.use(cacheMiddleware(mockClient));

      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      await fetcher.fetchOrThrow('https://api.example.com/resource', {
        method: 'PUT',
        headers: {
          'X-RESOURCE-NO-STALE': '1',
        },
      });

      expect(mockClient.clearResourceCache).toHaveBeenCalledWith([], []);
    });

    it('should use cache middle to update data with content-location', async () => {
      const mockClient = {
        clearResourceCache: vi.fn(),
        getStateForResponse: vi.fn(),
        cacheState: vi.fn(),
      } as unknown as ClientInstance;

      fetcher.use(cacheMiddleware(mockClient));
      const mockResponse = new Response('success', {
        status: 200,
        headers: {
          'Content-Location': '/updated-resource',
        },
      });

      mockFetch.mockResolvedValue(mockResponse);
      const mockState = {
        uri: 'mock-state',
      } as State;
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(mockState);

      await fetcher.fetchOrThrow('https://api.example.com/resource', {
        method: 'PUT',
      });

      expect(mockClient.clearResourceCache).toHaveBeenCalledWith(
        ['https://api.example.com/resource'],
        [],
      );
      expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
        {
          rel: '',
          href: '/updated-resource',
          context: 'https://api.example.com/resource',
        },
        expect.any(Response),
      );
      expect(mockClient.cacheState).toHaveBeenCalledWith(mockState);
    });
  });
});
