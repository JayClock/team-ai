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
import { SafeAny } from '../../lib/archtype/safe-any.js';

const mockFetcher = {
  fetchOrThrow: vi.fn()
};

const mockClient = {
  bookmarkUri: 'https://www.test.com/',
  fetcher: mockFetcher,
  getStateForResponse: vi.fn(),
  go: vi.fn(),
  cacheState: vi.fn(),
  cache: {
    get:vi.fn()
  }
} as unknown as ClientInstance;

describe('StateResource GET Requests', () => {
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

  it('should handle non-embedded resource request with HTTP call', async () => {
    const link: Link = { ...halUser._links.conversations, context: mockClient.bookmarkUri, rel: 'conversations' };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    const options: RequestInit ={
      method: 'GET',
      headers: new Headers({ 'Content-Type': 'application/json' }),
    };

    vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, link));
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const state: State<Collection<Conversation>> = await userState.follow('conversations', {
      page: 1,
      pageSize: 10
    }).withGet().request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith('https://www.test.com/api/users/1/conversations?page=1&pageSize=10', options);
    expect(mockClient.cacheState).toHaveBeenCalledWith(state)
    expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
      mockResponse.url,
      mockResponse,
      'conversations'
    );
  })

  it('should get existed cache and do not request',async ()=>{
    const cacheState = {} as State;
    const link: Link = { ...halUser._links.conversations, context: mockClient.bookmarkUri, rel: 'conversations' };

    vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, link));
    vi.spyOn(mockClient.cache,'get').mockReturnValue(cacheState)

    const state = await userState.follow('conversations').withGet().request();
    expect(state).toBe(cacheState)
  })

  describe('activeRefresh', () => {
    const link: Link = { ...halUser._links.conversations, context: mockClient.bookmarkUri, rel: 'conversations' };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, link));
      vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);
    });

    it('should de-duplicate identical GET requests made in quick succession', async () => {
      const request1 = userState.follow('conversations').withGet().request();
      const request2 = userState.follow('conversations').withGet().request();

      const [result1, result2] = await Promise.all([request1, request2]);

      expect(result1).toBe(result2);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(1);
    });

    it('should not de-duplicate requests with different URLs', async () => {
      const request1 = userState.follow('conversations', { page: 1 }).withGet().request();
      const request2 = userState.follow('conversations', { page: 2 }).withGet().request();

      await Promise.all([request1, request2]);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });

    it('should not de-duplicate requests with different headers', async () => {
      const request1 = userState.follow('conversations').withGet({ headers: { 'X-Custom': 'value1' } }).request();
      const request2 = userState.follow('conversations').withGet({ headers: { 'X-Custom': 'value2' } }).request();

      await Promise.all([request1, request2]);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });

    it('should clean up activeRefresh after request completes', async () => {
      const linkResource = userState.follow('conversations') as LinkResource<SafeAny>;

      const requestPromise = linkResource.withGet().request();

      await requestPromise;

      const secondRequest = linkResource.withGet().request();
      await secondRequest;

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });

    it('should not use activeRefresh for non-GET requests', async () => {
      const request1 = userState.follow('conversations').withPost({ data: { test: 'data' } }).request();
      const request2 = userState.follow('conversations').withPost({ data: { test: 'data' } }).request();

      await Promise.all([request1, request2]);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });
  });
});
