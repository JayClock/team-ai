import { describe, expect, vi } from 'vitest';
import { Conversation, User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { Resource, State } from '../../lib/index.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { Collection } from '../../lib/index.js';
import { resolve } from '../../lib/util/uri.js';
import { SafeAny } from '../../lib/archtype/safe-any.js';
import { expand } from '../../lib/util/uri-template.js';

const mockFetcher = {
  fetchOrThrow: vi.fn(),
};

const mockClient = {
  bookmarkUri: 'https://www.test.com/',
  fetcher: mockFetcher,
  getStateForResponse: vi.fn(),
  go: vi.fn(),
  cacheState: vi.fn(),
  cache: {
    get: vi.fn(),
  },
} as unknown as ClientInstance;

describe('Resource GET Requests', () => {
  const resource: Resource<User> = new Resource(mockClient, {
    rel: '',
    href: '/api/users/1',
    context: mockClient.bookmarkUri,
  });
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  let userState: State<User>;

  beforeAll(async () => {
    const response = Response.json(halUser);
    const mockUserState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      response,
    );
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(response);
    vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(
      mockUserState,
    );
    userState = await resource.request();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should handle non-embedded resource request with HTTP call', async () => {
    const link: Link = {
      ...halUser._links.conversations,
      context: mockClient.bookmarkUri,
      rel: 'conversations',
    };

    const variables = {
      page: 1,
      pageSize: 10,
    };

    const mockResponse = {
      url: resolve(link.context, expand(link, variables)),
      json: vi.fn().mockResolvedValue(halConversations),
    } as unknown as Response;

    const options: RequestInit = {
      method: 'GET',
      headers: new Headers({ 'Content-Type': 'application/json' }),
    };

    const mockConversationsState = await halStateFactory.create<User>(
      mockClient,
      mockResponse.url,
      mockResponse,
    );

    vi.spyOn(mockClient, 'go').mockReturnValue(new Resource(mockClient, link));
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      mockResponse,
    );
    vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(
      mockConversationsState,
    );

    const state: State<Collection<Conversation>> = await userState
      .follow('conversations')
      .withTemplateParameters(variables)
      .withMethod('GET')
      .request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://www.test.com/api/users/1/conversations?page=1&pageSize=10',
      options,
    );
    expect(mockClient.cacheState).toHaveBeenCalledWith(state);
    expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
      mockResponse.url,
      mockResponse,
      'conversations',
    );
  });

  it('should get existed cache and do not request', async () => {
    const cacheState = {} as State;
    const link: Link = {
      ...halUser._links.conversations,
      context: mockClient.bookmarkUri,
      rel: 'conversations',
    };

    vi.spyOn(mockClient, 'go').mockReturnValue(new Resource(mockClient, link));
    vi.spyOn(mockClient.cache, 'get').mockReturnValueOnce(cacheState);

    const state = await userState
      .follow('conversations')
      .withMethod('GET')
      .request();
    expect(state).toBe(cacheState);
  });

  describe('activeRefresh', () => {
    const link: Link = {
      ...halUser._links.conversations,
      context: mockClient.bookmarkUri,
      rel: 'conversations',
    };

    const mockResponse = {
      json: vi.fn().mockResolvedValue(halConversations),
    } as unknown as Response;

    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(mockClient, 'go').mockReturnValue(
        new Resource(mockClient, link),
      );
      vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
        mockResponse,
      );
    });

    it('should de-duplicate identical GET requests made in quick succession', async () => {
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: resolve(mockClient.bookmarkUri, '/api/users/1/conversations'),
      } as State);
      const request1 = userState
        .follow('conversations')
        .withMethod('GET')
        .request();
      const request2 = userState
        .follow('conversations')
        .withMethod('GET')
        .request();

      const [result1, result2] = await Promise.all([request1, request2]);

      expect(result1).toBe(result2);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(1);
    });

    it('should not de-duplicate requests with different URLs', async () => {
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: resolve(
          mockClient.bookmarkUri,
          '/api/users/1/conversations?page=1',
        ),
      } as State);
      const request1 = userState
        .follow('conversations')
        .withTemplateParameters({ page: 1 })
        .withMethod('GET')
        .request();
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: resolve(
          mockClient.bookmarkUri,
          '/api/users/1/conversations?page=2',
        ),
      } as State);
      const request2 = userState
        .follow('conversations')
        .withTemplateParameters({ page: 2 })
        .withMethod('GET')
        .request();

      await Promise.all([request1, request2]);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });

    it('should clean up activeRefresh after request completes', async () => {
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: resolve(mockClient.bookmarkUri, '/api/users/1/conversations'),
      } as State);
      const resource = userState.follow('conversations') as Resource<SafeAny>;

      const requestPromise = resource.withMethod('GET').request();

      await requestPromise;

      const secondRequest = resource.withMethod('GET').request();
      await secondRequest;

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });
  });
});
