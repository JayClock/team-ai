import { ClientInstance } from '../lib/client-instance.js';
import { Fetcher } from '../lib/http/fetcher.js';
import { Config } from '../lib/archtype/config.js';
import { Resource, State } from '../lib/index.js';
import { resolve } from '../lib/util/uri.js';
import { Cache } from '../lib/cache/cache.js';
import { beforeEach, describe, expect, vi } from 'vitest';
import { Link } from '../lib/links/link.js';
import { HalStateFactory } from '../lib/state/hal-state/hal-state.factory.js';
import { BinaryStateFactory } from '../lib/state/binary-state/binary-state.factory.js';
import { StreamStateFactory } from '../lib/state/stream-state/stream-state.factory.js';
import { ForeverCache, NeverCache } from '../lib/cache/intex.js';

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
