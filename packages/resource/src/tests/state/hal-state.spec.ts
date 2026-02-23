import { describe, expect } from 'vitest';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { BaseState } from '../../lib/state/base-state.js';
import { SafeAny } from '../../lib/archtype/safe-any.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { Account } from '../fixtures/interface.js';
import { Collection } from '../../lib/index.js';
import { HalLink, HalResource } from 'hal-types';

const mockClient = {
  bookmarkUri: 'https://example.com/',
  go: vi.fn(),
  cacheState: vi.fn()
} as unknown as ClientInstance;

describe('HalState', async () => {
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  const mockHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Language': 'zh-CN',
    'Content-Location': '/api/resource/123',
    ETag: '"abc123def456"',
    Expires: 'Wed, 21 Oct 2025 07:28:00 GMT',
    'Last-Modified': 'Mon, 15 Sep 2024 12:00:00 GMT',
    Warning: '299 - "Deprecated API"',
    Deprecation: 'true',
    Sunset: 'Wed, 21 Oct 2026 07:28:00 GMT',
    Title: 'API Resource Details',
  };

  describe('factory', () => {
    it('should create state from hal resource', async () => {
      const state = await halStateFactory.create(
        mockClient,
        {
          rel: '',
          href: '/api/users/1',
          context: mockClient.bookmarkUri,
        },
        Response.json(halUser, { headers: mockHeaders }),
      );

      expect(state.uri).toEqual('https://example.com/api/users/1');
      expect(state.data).toEqual({
        id: '1',
        name: 'JayClock',
        email: 'z891853602@gmail.com',
      });
      expect(state).toBeInstanceOf(BaseState);
    });

    it('should create collection from hal _embedded', async () => {
      const state = await halStateFactory.create<Collection<Account>>(
        mockClient,
        {
          rel: 'accounts',
          href: '/api/users/1',
          context: mockClient.bookmarkUri,
        },
        Response.json(halUser),
      );

      expect(state.collection.length).toEqual(
        halUser._embedded.accounts.length,
      );
      expect(state.collection[0].uri).toEqual(
        'https://example.com/api/users/1/accounts/1',
      );

      // Data should be purified (without _links, _embedded, etc.)
      const { _links, ...pureAccount } = halUser._embedded.accounts[0];
      expect(state.collection[0].data).toEqual(pureAccount);
    });

    it('should mark embedded collection as full and only collection items as partial', async () => {
      vi.clearAllMocks();

      await halStateFactory.create(
        mockClient,
        {
          rel: '',
          href: '/api/users/1',
          context: mockClient.bookmarkUri,
        },
        Response.json(halUser),
      );

      const cachedStates = mockClient.cacheState.mock.calls.map(
        (args) => args[0] as BaseState<SafeAny>,
      );
      const embeddedAccounts = cachedStates.find(
        (cachedState) =>
          cachedState.uri === 'https://example.com/api/users/1/accounts',
      );

      expect(embeddedAccounts).toBeDefined();
      expect(embeddedAccounts?.isPartial).toBe(false);
      expect(
        embeddedAccounts?.collection.every((item) => item.isPartial),
      ).toBe(true);
    });

    it('should merge HTTP Link headers into parsed links', async () => {
      const state = await halStateFactory.create(
        mockClient,
        {
          rel: '',
          href: '/api/users/1',
          context: mockClient.bookmarkUri,
        },
        Response.json(
          {
            _links: {
              self: { href: '/api/users/1' },
            },
          },
          {
            headers: {
              Link: '</api/users/2>; rel="next", </api/users/3>; rel="next"',
            },
          },
        ),
      );

      const nextLinks = (state as SafeAny).links.getMany('next');
      expect(nextLinks).toHaveLength(2);
      expect(nextLinks[0]?.href).toEqual('/api/users/2');
      expect(nextLinks[1]?.href).toEqual('/api/users/3');
    });

    it('should backfill links from _embedded self links when rel is missing in _links', async () => {
      const state = await halStateFactory.create(
        mockClient,
        {
          rel: '',
          href: '/api/users/1',
          context: mockClient.bookmarkUri,
        },
        Response.json({
          _links: {
            self: { href: '/api/users/1' },
          },
          _embedded: {
            accounts: [
              {
                _links: { self: { href: '/api/users/1/accounts/1' } },
              },
              {
                _links: { self: { href: '/api/users/1/accounts/2' } },
              },
            ],
          },
        }),
      );

      const accountLinks = (state as SafeAny).links.getMany('accounts');
      expect(accountLinks).toHaveLength(2);
      expect(accountLinks[0]?.href).toEqual('/api/users/1/accounts/1');
      expect(accountLinks[1]?.href).toEqual('/api/users/1/accounts/2');
    });

    it('should create collection from the only embedded array when rel key differs', async () => {
      const state = await halStateFactory.create<Collection<Account>>(
        mockClient,
        {
          rel: 'items',
          href: '/api/users/1/renamed-collection',
          context: mockClient.bookmarkUri,
        },
        Response.json({
          _links: {
            self: {
              href: '/api/users/1/renamed-collection',
            },
          },
          _embedded: {
            records: [
              {
                id: 'acc-1',
                provider: 'github',
                _links: {
                  self: {
                    href: '/api/users/1/accounts/acc-1',
                  },
                },
              },
            ],
          },
        }),
      );

      expect(state.collection.length).toBe(1);
      expect(state.collection[0].uri).toEqual(
        'https://example.com/api/users/1/accounts/acc-1',
      );
      expect(state.collection[0].data).toMatchObject({
        id: 'acc-1',
        provider: 'github',
      });
    });

    it('should return empty collection when embedded has multiple arrays and rel key differs', async () => {
      const state = await halStateFactory.create(
        mockClient,
        {
          rel: 'items',
          href: '/api/users/1/ambiguous-collection',
          context: mockClient.bookmarkUri,
        },
        Response.json({
          _links: {
            self: {
              href: '/api/users/1/ambiguous-collection',
            },
          },
          _embedded: {
            accounts: [
              {
                id: '1',
                _links: {
                  self: {
                    href: '/api/users/1/accounts/1',
                  },
                },
              },
            ],
            conversations: [
              {
                id: '2',
                _links: {
                  self: {
                    href: '/api/users/1/conversations/2',
                  },
                },
              },
            ],
          },
        }),
      );

      expect(state.collection).toEqual([]);
    });
  });

  describe('serializeBody', () => {
    it('should include _links in serialized body', async () => {
      const state = await halStateFactory.create(
        mockClient,
        {
          rel: '',
          href: '/api/users/1',
          context: mockClient.bookmarkUri,
        },
        Response.json(halUser, { headers: mockHeaders }),
      );

      const serialized = state.serializeBody() as string;
      const resource = JSON.parse(serialized) as HalResource;

      expect(resource).toMatchObject({
        id: '1',
        name: 'JayClock',
        email: 'z891853602@gmail.com',
      });

      expect(resource._links).toBeDefined();
      expect(resource._links?.self).toBeDefined();
      expect((resource._links?.self as HalLink).href).toBe('/api/users/1');

      expect(resource._links?.accounts).toBeDefined();
    });
  });

  describe('clone', () => {
    it('should clone state while keeping data immutable', async () => {
      const state = await halStateFactory.create(
        mockClient,
        {
          rel: '',
          href: '/api/users/1',
          context: mockClient.bookmarkUri,
        },
        Response.json(halUser, { headers: mockHeaders }),
      );

      const cloned = state.clone();

      expect(cloned).not.toBe(state);

      expect(cloned).toBeInstanceOf(BaseState);

      expect(cloned.uri).toEqual(state.uri);

      expect(cloned.data).toEqual(state.data);
      expect(cloned.data).toBe(state.data);
      expect(Object.isFrozen(cloned.data)).toBe(true);

      try {
        (cloned.data as SafeAny).name = 'Modified';
      } catch {
        // ignore write attempts to frozen objects
      }
      expect(state.data.name).toBe('JayClock');
      expect(cloned.data.name).toBe('JayClock');
    });
  });
});
