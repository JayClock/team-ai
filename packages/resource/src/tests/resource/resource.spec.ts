import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { State } from '../../lib/state/state.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { RequestOptions, Resource } from '../../lib/index.js';
import { LinkResource } from '../../lib/resource/link-resource.js';
import { resolve } from '../../lib/util/uri.js';

const mockFetcher = {
  fetchOrThrow: vi.fn()
};

const mockClient = {
  bookmarkUri: 'https://www.test.com/',
  fetcher: mockFetcher,
  getStateForResponse: vi.fn(),
  go: vi.fn()
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
  });

  it('should generate states from user embedded latest-conversation', async () => {
    const latestConversationResource = userState.follow('latest-conversation');
    const conversation = await latestConversationResource.request();

    expect(halUser._embedded['latest-conversation']).toEqual(expect.objectContaining(conversation.data))
  });

  describe('should handle non-embedded resource request with HTTP call', () => {
    const link: Link = { ...halUser._links.conversations, context: mockClient.bookmarkUri, rel: 'conversations' };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    let options: RequestOptions;


    beforeEach(() => {
      vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, link));
      vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);
    })

    it('should request with post', async () => {
      options = {
        body: {
          page: 1,
          pageSize: 10
        },
        method: 'POST',
      };
      await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withPost({
        page: 1,
        pageSize: 10
      }).request();
    })

    it('should request with put', async () => {
      options = {
        body: {
          page: 1,
          pageSize: 10
        },
        method: 'PUT',
      };
      await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withPut({
        page: 1,
        pageSize: 10
      }).request();
    })

    it('should request with patch', async () => {
      options = {
        body: {
          page: 1,
          pageSize: 10
        },
        method: 'PATCH',
      };
      await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withPatch({
        page: 1,
        pageSize: 10
      }).request();
    })

    it('should request with get', async () => {
      options = {
        method: 'GET',
      };
      await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withGet().request();
    })

    it('should request with delete', async () => {
      options = {
        method: 'DELETE',
      };
      await userState.follow('conversations', {
        page: 1,
        pageSize: 10
      }).withDelete().request();
    })

    afterEach(() => {
      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(link, options);
      expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
        mockResponse.url,
        mockResponse,
        'conversations'
      );
    })
  })

  it('should verify request body with hal template', async () => {
    vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, { ...halUser._links['latest-conversation'], rel: 'latest-conversation' }))
    await expect(userState.follow('create-conversation').withPost({ title: 123 }).request()).rejects.toThrow('Invalid');
  });
});
