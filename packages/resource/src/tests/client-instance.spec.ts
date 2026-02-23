import { ClientInstance } from '../lib/client-instance.js';
import { Fetcher } from '../lib/http/fetcher.js';
import { Config } from '../lib/archtype/config.js';
import { Resource, State } from '../lib/index.js';
import { resolve } from '../lib/util/uri.js';
import { Cache } from '../lib/cache/cache.js';
import { beforeEach, describe, expect, vi } from 'vitest';
import { Link } from '../lib/links/link.js';
import { Links } from '../lib/links/links.js';
import { HalStateFactory } from '../lib/state/hal-state/hal-state.factory.js';
import { BinaryStateFactory } from '../lib/state/binary-state/binary-state.factory.js';
import { StreamStateFactory } from '../lib/state/stream-state/stream-state.factory.js';
import { ForeverCache, NeverCache } from '../lib/cache/index.js';

const mockFetcher = { use: vi.fn() } as unknown as Fetcher;

const mockConfig = { baseURL: 'https://www.example.com' } as Config;

const mockHalStateFactory = {
  create: vi.fn(),
} as unknown as HalStateFactory;

const mockBinaryStateFactory = {
  create: vi.fn(),
} as BinaryStateFactory;

const mockStreamStateFactory = {
  create: vi.fn(),
} as StreamStateFactory;

const mockCache = {
  store: vi.fn(),
  clear: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  has: vi.fn(),
} as unknown as Cache;

describe('ClientInstance', () => {
  const clientInstance = new ClientInstance(
    mockFetcher,
    mockConfig,
    mockCache,
    mockHalStateFactory,
    mockBinaryStateFactory,
    mockStreamStateFactory,
  );

  it('should set bookmarkUri with config baseURL', () => {
    expect(clientInstance.bookmarkUri).toEqual(mockConfig.baseURL);
  });

  it('should use cache from config when provided', () => {
    const configuredCache = new NeverCache();
    const fallbackCache = new ForeverCache();

    const instance = new ClientInstance(
      mockFetcher,
      { ...mockConfig, cache: configuredCache },
      fallbackCache,
      mockHalStateFactory,
      mockBinaryStateFactory,
      mockStreamStateFactory,
    );

    expect(instance.cache).toBe(configuredCache);
  });

  describe('should go to link resource and cache resource', () => {
    it('should go with no uri', () => {
      expect(clientInstance.go()).toBeInstanceOf(Resource);
      expect(
        clientInstance.resources.has(resolve(clientInstance.bookmarkUri, '')),
      ).toBeTruthy();
    });

    it('should go with string type uri', () => {
      expect(clientInstance.go('href-string')).toBeInstanceOf(Resource);
      expect(
        clientInstance.resources.has(
          resolve(clientInstance.bookmarkUri, 'href-string'),
        ),
      ).toBeTruthy();
    });

    it('should go with new link type uri', () => {
      expect(
        clientInstance.go({ rel: 'rel', href: 'href-link' }),
      ).toBeInstanceOf(Resource);
      expect(
        clientInstance.resources.has(
          resolve(clientInstance.bookmarkUri, 'href-link'),
        ),
      ).toBeTruthy();
    });

    it('should preserve provided link context when resolving relative href', () => {
      const resource = clientInstance.go(
        {
          rel: 'accounts',
          href: 'list',
          context: 'https://www.example.com/api/users/1/',
        } as unknown as Link,
      );

      expect(resource.uri).toEqual('https://www.example.com/api/users/1/list');
    });
  });

  describe('getStateForResponse', () => {
    describe('generate binary state', () => {
      it('should generate binary state when content-type is not existed', () => {
        clientInstance.getStateForResponse(
          {} as Link,
          new Response(null, { headers: { 'Content-Type': '' } }),
        );
        expect(mockBinaryStateFactory.create).toHaveBeenCalled();
      });

      it('should generate binary state when status is 204', () => {
        clientInstance.getStateForResponse(
          {} as Link,
          new Response(null, { status: 204 }),
        );
        expect(mockBinaryStateFactory.create).toHaveBeenCalled();
      });
    });

    describe('generate hal state', () => {
      it('should generate hal state when content-type application/prs.hal-forms+json', () => {
        clientInstance.getStateForResponse(
          {} as Link,
          new Response(null, {
            headers: { 'Content-Type': 'application/prs.hal-forms+json' },
          }),
        );
        expect(mockHalStateFactory.create).toHaveBeenCalled();
      });

      it('should generate hal state when content-type application/hal+json', () => {
        clientInstance.getStateForResponse(
          {} as Link,
          new Response(null, {
            headers: { 'Content-Type': 'application/hal+json' },
          }),
        );
        expect(mockHalStateFactory.create).toHaveBeenCalled();
      });

      it('should generate hal state when content-type application/json', () => {
        clientInstance.getStateForResponse(
          {} as Link,
          new Response(null, {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        expect(mockHalStateFactory.create).toHaveBeenCalled();
      });

      it('should generate hal state when content-type match /^application\\/[A-Za-z-.]+\\+json/', () => {
        clientInstance.getStateForResponse(
          {} as Link,
          new Response(null, {
            headers: { 'Content-Type': 'application/geo+json' },
          }),
        );
        expect(mockHalStateFactory.create).toHaveBeenCalled();
      });
    });

    describe('generate stream state', () => {
      it('should generate hal state when content-type text/event-stream', () => {
        clientInstance.getStateForResponse(
          {} as Link,
          new Response(null, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
        expect(mockStreamStateFactory.create).toHaveBeenCalled();
      });
    });

    it('should use configured custom content type factories', () => {
      const customFactory = {
        create: vi.fn(),
      };
      const instance = new ClientInstance(
        mockFetcher,
        {
          ...mockConfig,
          contentTypeMap: {
            'application/vnd.api+json': customFactory,
          },
        },
        mockCache,
        mockHalStateFactory,
        mockBinaryStateFactory,
        mockStreamStateFactory,
      );

      instance.getStateForResponse(
        {} as Link,
        new Response(null, {
          headers: { 'Content-Type': 'application/vnd.api+json' },
        }),
      );

      expect(customFactory.create).toHaveBeenCalled();
    });

    it('should allow registering content type factories at runtime', () => {
      const customFactory = {
        create: vi.fn(),
      };

      clientInstance.registerContentType(
        'application/vnd.collection+json',
        customFactory as never,
        '0.8',
      );

      clientInstance.getStateForResponse(
        {} as Link,
        new Response(null, {
          headers: { 'Content-Type': 'application/vnd.collection+json' },
        }),
      );

      expect(customFactory.create).toHaveBeenCalled();
      expect(clientInstance.contentTypeMap['application/vnd.collection+json'][1]).toBe('0.8');
    });
  });

  describe('cache', () => {
    const level_3 = {
      collection: [],
      uri: resolve(clientInstance.bookmarkUri, 'level_3'),
      links: { getMany: vi.fn().mockReturnValue([]) },
    } as unknown as State;

    const level_2 = {
      collection: [level_3],
      uri: resolve(clientInstance.bookmarkUri, 'level_2'),
      links: { getMany: vi.fn().mockReturnValue([]) },
    } as unknown as State;

    const level_1 = {
      collection: [level_2],
      uri: resolve(clientInstance.bookmarkUri, 'level_1'),
      links: { getMany: vi.fn().mockReturnValue([]) },
    } as unknown as State;

    const resource_1 = clientInstance.go('level_1');
    const resource_2 = clientInstance.go('level_2');
    const resource_3 = clientInstance.go('level_3');

    beforeEach(() => {
      clientInstance.cacheState(level_1);
    });

    it('should state cache with collection', () => {
      clientInstance.cacheState(level_1);

      expect(mockCache.store).toHaveBeenNthCalledWith(1, level_1);
      expect(mockCache.store).toHaveBeenNthCalledWith(2, level_2);
      expect(mockCache.store).toHaveBeenNthCalledWith(3, level_3);
    });

    it('should emit update when state uri match resource', () => {
      let triggered = false;
      resource_1.once('update', () => (triggered = true));
      clientInstance.cacheState(level_1);
      expect(triggered).toBeTruthy();
    });

    it('should emit delete and stale when clearResourceCache', () => {
      let deleted = '';
      let staled = '';
      resource_1.once('delete', () => (deleted += 1));
      resource_2.once('delete', () => (deleted += 2));
      resource_3.once('delete', () => (deleted += 3));
      resource_1.once('stale', () => (staled += 1));
      resource_2.once('stale', () => (staled += 2));
      resource_3.once('stale', () => (staled += 3));
      clientInstance.clearResourceCache([level_2.uri], [level_3.uri]);
      expect(deleted).toEqual('3');
      expect(staled).toEqual('2');
    });

    it('should invalidate dependent caches discovered from inv-by links', () => {
      const isolatedCache = {
        store: vi.fn(),
        clear: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        has: vi.fn(),
      } as unknown as Cache;
      const isolatedInstance = new ClientInstance(
        mockFetcher,
        mockConfig,
        isolatedCache,
        mockHalStateFactory,
        mockBinaryStateFactory,
        mockStreamStateFactory,
      );

      const targetUri = resolve(isolatedInstance.bookmarkUri, '/api/users/1');
      const dependentUri = resolve(
        isolatedInstance.bookmarkUri,
        '/api/users/1/conversations',
      );

      const target = {
        collection: [],
        uri: targetUri,
        links: new Links<Record<string, State>>(isolatedInstance.bookmarkUri),
      } as unknown as State;

      const dependent = {
        collection: [],
        uri: dependentUri,
        links: new Links<Record<string, State>>(isolatedInstance.bookmarkUri, [
          { rel: 'inv-by', href: targetUri },
        ]),
      } as unknown as State;

      let dependentStaled = false;
      isolatedInstance.go(dependentUri).once('stale', () => {
        dependentStaled = true;
      });

      isolatedInstance.cacheState(target);
      isolatedInstance.cacheState(dependent);
      isolatedInstance.clearResourceCache([targetUri], []);

      expect(isolatedCache.delete).toHaveBeenCalledWith(targetUri);
      expect(isolatedCache.delete).toHaveBeenCalledWith(dependentUri);
      expect(dependentStaled).toBe(true);
    });
  });

  describe('use', () => {
    it('should call fetcher.use with middleware and default origin', () => {
      const mockMiddleware = vi.fn();

      clientInstance.use(mockMiddleware);

      expect(mockFetcher.use).toHaveBeenCalledWith(mockMiddleware, '*');
    });

    it('should call fetcher.use with middleware and custom origin', () => {
      const mockMiddleware = vi.fn();
      clientInstance.use(mockMiddleware, 'https://api.example.com');

      expect(mockFetcher.use).toHaveBeenCalledWith(
        mockMiddleware,
        'https://api.example.com',
      );
    });
  });
});
