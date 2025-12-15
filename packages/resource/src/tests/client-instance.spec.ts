import { ClientInstance } from '../lib/client-instance.js';
import { Fetcher } from '../lib/http/fetcher.js';
import { Config } from '../lib/archtype/config.js';
import { State, StateFactory } from '../lib/state/state.js';
import { resolve } from '../lib/util/uri.js';
import { Cache } from '../lib/cache/cache.js';
import { expect, vi } from 'vitest';
import { Resource } from '../lib/index.js';

const mockFetcher = { use: vi.fn() } as unknown as Fetcher;

const mockConfig = { baseURL: 'https://www.example.com' } as Config;

const mockHalStateFactory = {
  create: vi.fn(),
} as StateFactory;

const mockBinaryStateFactory = {
  create: vi.fn(),
} as StateFactory;

const mockStreamStateFactory = {
  create: vi.fn(),
} as StateFactory;

const mockCache = {
  store: vi.fn(),
  clear: vi.fn(),
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
          '',
          new Response(null, { headers: { 'Content-Type': '' } }),
        );
        expect(mockBinaryStateFactory.create).toHaveBeenCalled();
      });

      it('should generate binary state when status is 204', () => {
        clientInstance.getStateForResponse(
          '',
          new Response(null, { status: 204 }),
        );
        expect(mockBinaryStateFactory.create).toHaveBeenCalled();
      });
    });

    describe('generate hal state', () => {
      it('should generate hal state when content-type application/prs.hal-forms+json', () => {
        clientInstance.getStateForResponse(
          '',
          new Response(null, {
            headers: { 'Content-Type': 'application/prs.hal-forms+json' },
          }),
        );
        expect(mockHalStateFactory.create).toHaveBeenCalled();
      });

      it('should generate hal state when content-type application/hal+json', () => {
        clientInstance.getStateForResponse(
          '',
          new Response(null, {
            headers: { 'Content-Type': 'application/hal+json' },
          }),
        );
        expect(mockHalStateFactory.create).toHaveBeenCalled();
      });

      it('should generate hal state when content-type application/json', () => {
        clientInstance.getStateForResponse(
          '',
          new Response(null, {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        expect(mockHalStateFactory.create).toHaveBeenCalled();
      });

      it('should generate hal state when content-type match /^application\\/[A-Za-z-.]+\\+json/', () => {
        clientInstance.getStateForResponse(
          '',
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
          '',
          new Response(null, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
        expect(mockStreamStateFactory.create).toHaveBeenCalled();
      });
    });
  });

  describe('cache', () => {
    it('should clear cache', () => {
      clientInstance.clearCache();
      expect(mockCache.clear).toHaveBeenCalled();
    });

    it('should state cache with collection', () => {
      const level_3 = { collection: [], uri: 'level-3' } as unknown as State;

      const level_2 = {
        collection: [level_3],
        uri: 'level-2',
      } as unknown as State;

      const level_1 = {
        collection: [level_2],
        uri: 'level-1',
      } as unknown as State;

      clientInstance.cacheState(level_1);

      expect(mockCache.store).toHaveBeenNthCalledWith(1, level_1);
      expect(mockCache.store).toHaveBeenNthCalledWith(2, level_2);
      expect(mockCache.store).toHaveBeenNthCalledWith(3, level_3);
    });

    it('should emit when state uri match resource', () => {
      const mockState = {
        uri: resolve(clientInstance.bookmarkUri, 'resource-match-state'),
        collection: [],
      } as State;
      let triggered = false;
      const mockResource = clientInstance.go('resource-match-state');
      mockResource.once('update', () => (triggered = true));
      clientInstance.cacheState(mockState);
      expect(triggered).toBeTruthy();
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
