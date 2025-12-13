import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { Link } from '../../lib/links/link.js';
import { State } from '../../lib/state/state.js';
import { LinkResource } from '../../lib/resource/link-resource.js';
import { resolve } from '../../lib/util/uri.js';
import { mockClient, setupUserState, clearAllMocks } from './mock-setup.js';

describe('StateResource POST Requests', () => {
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
      new LinkResource(mockClient, link),
    );
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      mockResponse,
    );

    await userState
      .follow('create-conversation')
      .withPost({
        data: newConversationData,
        headers: customHeaders,
      })
      .request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://www.test.com/api/users/1/conversations',
      options,
    );

    expect(mockClient.cacheState).toHaveBeenCalledTimes(0);
  });
});
