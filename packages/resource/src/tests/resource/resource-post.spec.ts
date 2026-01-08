import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { Link } from '../../lib/links/link.js';
import { Resource, State } from '../../lib/index.js';
import { resolve } from '../../lib/util/uri.js';
import { clearAllMocks, mockClient, setupUserState } from './mock-setup.js';

describe('Resource POST Requests', () => {
  let userState: State<User>;
  const newConversationData = { title: 'New Test Conversation' };

  beforeAll(async () => {
    const setup = await setupUserState();
    userState = setup.userState;
    expect(userState).toBeDefined();
  });

  beforeEach(async () => {
    clearAllMocks();
  });

  it('should send POST request with custom headers and not cache state', async () => {
    const link: Link = {
      ...halUser._links['create-conversation'],
      context: mockClient.bookmarkUri,
      rel: 'create-conversation',
    };

    const createdConversation = {
      id: 'conv-new',
      title: 'New Test Conversation',
      _links: {
        self: {
          href: '/api/conversations/conv-new',
        },
        user: {
          href: '/api/users/1',
        },
      },
    };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(createdConversation),
    } as unknown as Response;

    const customHeaders = {
      'X-Custom-Header': 'custom-value',
      Authorization: 'Bearer token123',
    };

    const options: RequestInit = {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        ...customHeaders,
      }),
      body: JSON.stringify(newConversationData),
    };

    vi.spyOn(mockClient, 'go').mockReturnValue(
      new Resource(mockClient, link, [
        {
          method: 'POST',
          uri: '/api/users/1/conversations',
          contentType: 'application/json',
          fields: [],
        },
      ]),
    );
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      mockResponse,
    );
    vi.spyOn(mockClient.cache, 'get').mockReturnValue(userState);

    await userState.follow('create-conversation').withPost().request({
      data: newConversationData,
      headers: customHeaders,
    });

    const form = await userState
      .follow('create-conversation')
      .withPost()
      .getForm();

    expect(form?.uri).toEqual(halUser._templates['create-conversation'].target);
    expect(form?.method).toEqual(
      halUser._templates['create-conversation'].method,
    );

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://www.test.com/api/users/1/conversations',
      options,
    );

    expect(mockClient.cacheState).toHaveBeenCalledTimes(0);
  });

  describe('activeRefresh', () => {
    const link: Link = {
      ...halUser._links['create-conversation'],
      context: mockClient.bookmarkUri,
      rel: 'create-conversation',
    };

    const mockResponse = {
      json: vi.fn().mockResolvedValue({
        id: 'conv-new',
        title: 'New Test Conversation',
        _links: {
          self: {
            href: '/api/conversations/conv-new',
          },
        },
      }),
    } as unknown as Response;

    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(mockClient, 'go').mockReturnValue(
        new Resource(mockClient, link, [
          {
            method: 'POST',
            uri: '/api/users/1/conversations',
            contentType: 'application/json',
            fields: [],
          },
        ]),
      );
      vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
        mockResponse,
      );
    });

    it('should de-duplicate identical POST requests with dedup=true', async () => {
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: 'https://www.test.com/api/users/1/conversations',
      } as State);

      const request1 = userState
        .follow('create-conversation')
        .withPost({ dedup: true })
        .request({
          data: newConversationData,
        });

      const request2 = userState
        .follow('create-conversation')
        .withPost({ dedup: true })
        .request({
          data: newConversationData,
        });

      const [result1, result2] = await Promise.all([request1, request2]);

      expect(result1).toBe(result2);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(1);
    });

    it('should not de-duplicate POST requests with dedup=false', async () => {
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: 'https://www.test.com/api/users/1/conversations',
      } as State);

      const request1 = userState
        .follow('create-conversation')
        .withPost({ dedup: false })
        .request({
          data: newConversationData,
        });

      const request2 = userState
        .follow('create-conversation')
        .withPost({ dedup: false })
        .request({
          data: newConversationData,
        });

      await Promise.all([request1, request2]);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });

    it('should de-duplicate only POST requests with same data', async () => {
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: 'https://www.test.com/api/users/1/conversations',
      } as State);

      const request1 = userState
        .follow('create-conversation')
        .withPost({ dedup: true })
        .request({
          data: newConversationData,
        });

      const request2 = userState
        .follow('create-conversation')
        .withPost({ dedup: true })
        .request({
          data: { title: 'Different Conversation' },
        });

      await Promise.all([request1, request2]);

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });

    it('should clean up activeRefresh after POST request completes', async () => {
      vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue({
        uri: 'https://www.test.com/api/users/1/conversations',
      } as State);
      const resource = userState.follow('create-conversation');

      const requestPromise = resource.withPost({ dedup: true }).request({
        data: newConversationData,
      });

      await requestPromise;

      const secondRequest = resource.withPost({ dedup: true }).request({
        data: newConversationData,
      });
      await secondRequest;

      expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(2);
    });
  });
});
