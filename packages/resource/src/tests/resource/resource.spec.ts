import { describe, expect, vi } from 'vitest';
import { Account, User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halAccounts from '../fixtures/hal-accounts.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { LinkResource } from '../../lib/resource/link-resource.js';
import { HalState } from '../../lib/state/hal-state/hal-state.js';
import { Collection } from '../../lib/index.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { halStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';

const mockFetcher = {
  fetchOrThrow: vi.fn()
};

const mockClient = {
  fetcher: mockFetcher
} as unknown as ClientInstance;

describe('Resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle root resource request with embedded', async () => {
    const mockResponse = {
      url: 'https://www.test.com/api/users/1/accounts?page=1',
      json: vi.fn().mockResolvedValue(halAccounts)
    } as unknown as Response;

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const link = {
      rel: 'accounts',
      href: '/api/users/1/accounts'
    };

    const options = { query: { page: 1 }, body: { page: 1 } };

    const rootResource = new LinkResource<Collection<Account>>(mockClient, link).withRequestOptions(options);

    const result = await rootResource.request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(link, options);
    expect(result.collection.length).toEqual(halAccounts._embedded.accounts.length);
    expect(result.uri).toEqual('/api/users/1/accounts?page=1');
  });


  it('should handle embedded array resource request', async () => {

    const mockResponse = {
      url: 'https://www.test.com/api/users/1',
      json: vi.fn().mockResolvedValue(halUser)
    } as unknown as Response;

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const link = { rel: '', href: '/api/users/1' };

    const userState = new LinkResource(mockClient, link);

    const accountsResource = userState.follow('accounts');
    const result = await accountsResource.request();

    expect(result.collection).toHaveLength(2);
    expect(result.uri).toBe('/api/users/1/accounts');

    const firstAccount = result.collection[0] as HalState<Account>;
    expect(firstAccount.data.id).toBe('1');
    expect(firstAccount.data.provider).toBe('github');
    expect(firstAccount.data.providerId).toBe('35857909');
  });

  it('should handle embedded single resource request', async () => {
    const mockResponse = {
      url: 'https://www.test.com/api/users/1',
      json: vi.fn().mockResolvedValue(halUser)
    } as unknown as Response;

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const link = { rel: '', href: '/api/users/1' };

    const userState = new LinkResource(mockClient, link);

    const latestConversationResource = userState.follow('latest-conversation');
    const result = await latestConversationResource.request();

    expect(result.data.id).toBe('conv-456');
    expect(result.data.title).toBe('Recent chat about HATEOAS');
    expect(result.uri).toBe('/api/conversations/conv-456');
  });

  it('should handle non-embedded resource request with HTTP call', async () => {
    const mockResponse = {
      url: 'https://www.test.com/api/users/1/conversations?page=1&pageSize=10',
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    const userState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      Response.json(halUser)
    );

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const link: Link = { ...halUser._links.conversations, rel: 'conversations', type: 'GET' };

    const options = {
      query: {
        page: 1,
        pageSize: 10
      }
    };
    const conversationsResource = userState.follow('conversations').withRequestOptions(options);
    const result = await conversationsResource.request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(link, options);
    expect(result.collection).toHaveLength(40);
    expect(result.uri).toBe('/api/users/1/conversations?page=1&pageSize=10');
  });

  it('should get result with multi follow relation', async () => {
    const userState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      Response.json(halUser)
    );

    const mockResponse = {
      url: 'https://www.test.com/api/users/1/conversations?page=1&pageSize=10',
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const link1: Link = { ...halUser._links.conversations, rel: 'conversations', type: 'GET' };
    const link2: Link = { ...halConversations._links.next, rel: 'next', type: 'GET' };

    const options1 = {
      query: {
        page: 1,
        pageSize: 10
      }, body: {
        page: 1,
        pageSize: 10
      }
    };
    const options2 = {
      query: {
        page: 2,
        pageSize: 20
      }, body: {
        page: 2,
        pageSize: 20
      }
    };
    await userState
      .follow('conversations')
      .withRequestOptions(options1)
      .follow('next')
      .withRequestOptions(options2)
      .request();
    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenNthCalledWith(1, link1, options1);
    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenNthCalledWith(2, link2, options2);
  });

  it('should verify request body with hal template', async () => {
    const userState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      Response.json(halUser)
    );
    await expect(userState.follow('create-conversation').withRequestOptions({ body: { title: 123 } }).request()).rejects.toThrow('Invalid');
  });
});
