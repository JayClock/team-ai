import { describe, expect, vi } from 'vitest';
import { Conversation, User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { State } from '../../lib/state/state.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { Collection, Resource } from '../../lib/index.js';
import { LinkResource } from '../../lib/resource/link-resource.js';
import { resolve } from '../../lib/util/uri.js';

const mockFetcher = {
  fetchOrThrow: vi.fn()
};

const mockClient = {
  bookmarkUri: 'https://www.test.com/',
  fetcher: mockFetcher,
  getStateForResponse: vi.fn(),
  go: vi.fn(),
  cacheState: vi.fn(),
} as unknown as ClientInstance;

describe('StateResource', () => {
  const resource: Resource<User> = new LinkResource(mockClient, { rel: '', href: '/api/users/1' });
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  let userState: State<User>;

  beforeAll(async () => {
    const response = Response.json(halUser);
    const mockUserState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      response
    );
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(response);
    vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(mockUserState);
    userState = await resource.request();
    expect(userState).toBe(mockUserState);
    expect(mockClient.cacheState).toHaveBeenCalledWith(userState)
  })

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should return new link resource with resource follow', () => {
    expect(resource.follow('accounts')).toBeInstanceOf(LinkResource);
  })

  it('should generate states from user embedded accounts array', async () => {
    const accountsResource = userState.follow('accounts');
    const accounts = await accountsResource.request();
    expect(accounts.collection.length).toEqual(halUser._embedded.accounts.length)
    expect(mockClient.cacheState).toHaveBeenCalledWith(accounts)
  });

  it('should generate states from user embedded latest-conversation', async () => {
    const latestConversationResource = userState.follow('latest-conversation');
    const conversation = await latestConversationResource.request();
    expect(halUser._embedded['latest-conversation']).toEqual(expect.objectContaining(conversation.data))
    expect(mockClient.cacheState).toHaveBeenCalledWith(conversation)
  });

  describe('should handle non-embedded resource request with HTTP call', () => {
    const link: Link = { ...halUser._links.conversations, context: mockClient.bookmarkUri, rel: 'conversations' };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    let options: RequestInit;
    let state: State<Collection<Conversation>>;

    beforeEach(() => {
      vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, link));
      vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);
    })

    it('should request with post', async () => {
      options = {
        body: JSON.stringify({
          page: 1,
          pageSize: 10
        }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
        method: 'POST',
      };

      state = await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withPost({
        data: {
          page: 1,
          pageSize: 10
        }
      }).request();

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith('https://www.test.com/api/users/1/conversations?page=1&pageSize=10', options);
    })

    it('should request with put', async () => {
      options = {
        body: JSON.stringify({
          page: 1,
          pageSize: 10
        }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
        method: 'PUT',
      };

      state = await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withPut({
        data: {
          page: 1,
          pageSize: 10
        }
      }).request();

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith('https://www.test.com/api/users/1/conversations?page=1&pageSize=10', options);
    })

    it('should request with patch', async () => {
      options = {
        body: JSON.stringify({
          page: 1,
          pageSize: 10
        }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
        method: 'PATCH',
      };

      state = await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withPatch({
        data: {
          page: 1,
          pageSize: 10
        }
      }).request();
      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith('https://www.test.com/api/users/1/conversations?page=1&pageSize=10', options);
    })

    it('should request with get', async () => {
      options = {
        method: 'GET',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      };

      state = await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withGet().request();

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith('https://www.test.com/api/users/1/conversations?page=1&pageSize=10', options);
    })

    it('should request with delete', async () => {
      options = {
        method: 'DELETE',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      };

      state = await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withDelete().request();

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith('https://www.test.com/api/users/1/conversations', options);
    })

    afterEach(() => {
      expect(mockClient.cacheState).toHaveBeenCalledWith(state)
      expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
        mockResponse.url,
        mockResponse,
        'conversations'
      );
    })
  })

  it('should verify request body with hal template', async () => {
    vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, { ...halUser._links['latest-conversation'], rel: 'latest-conversation' }))
    await expect(userState.follow('create-conversation').withPost({ data: { title: 123 } }).request()).rejects.toThrow('Invalid');
  });
});
