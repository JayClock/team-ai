import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { Link } from '../../lib/links/link.js';
import { Resource, State } from '../../lib/index.js';
import { resolve } from '../../lib/util/uri.js';
import { clearAllMocks, mockClient, setupUserState } from './mock-setup.js';

describe('Resource PUT Requests', () => {
  let userState: State<User>;
  const updatedUserData = {
    name: 'Updated Name',
    email: 'updated@example.com',
  };

  beforeAll(async () => {
    const setup = await setupUserState();
    userState = setup.userState;
    expect(userState).toBeDefined();
  });

  beforeEach(async () => {
    clearAllMocks();
  });

  it('should send PUT request with custom headers', async () => {
    const link: Link = {
      ...halUser._links.self,
      context: mockClient.bookmarkUri,
      rel: 'self',
    };

    const updatedUser = {
      id: '1',
      name: 'Updated Name',
      email: 'updated@example.com',
      _links: {
        self: {
          href: '/api/users/1',
        },
      },
    };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(updatedUser),
    } as unknown as Response;

    const customHeaders = {
      'X-Custom-Header': 'custom-value',
      Authorization: 'Bearer token123',
    };

    const options: RequestInit = {
      method: 'PUT',
      headers: new Headers({
        'Content-Type': 'application/json',
        ...customHeaders,
      }),
      body: JSON.stringify(updatedUserData),
    };

    vi.spyOn(mockClient, 'go').mockReturnValue(new Resource(mockClient, link));
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      mockResponse,
    );

    await userState.follow('self').put({
      data: updatedUserData,
      headers: customHeaders,
    });

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://www.test.com/api/users/1',
      options,
    );
  });

  it('should support put(state) and suppress stale invalidation signal', async () => {
    const selfResource = userState.follow('self');
    const response = new Response(null, { status: 204 });

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(response);

    const result = await selfResource.put(userState);

    expect(result).toBe(userState);
    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(1);
    const requestInit = vi.mocked(mockClient.fetcher.fetchOrThrow).mock.calls[0][1];
    const requestHeaders = new Headers(requestInit?.headers);
    expect(requestHeaders.get('X-RESOURCE-NO-STALE')).toBe('1');
    expect(mockClient.cacheState).toHaveBeenCalledWith(userState);
    expect(mockClient.getStateForResponse).not.toHaveBeenCalled();
  });
});
