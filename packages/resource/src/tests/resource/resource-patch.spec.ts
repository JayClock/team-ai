import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { Link } from '../../lib/links/link.js';
import { Resource, State } from '../../lib/index.js';
import { resolve } from '../../lib/util/uri.js';
import { clearAllMocks, mockClient, setupUserState } from './mock-setup.js';

describe('Resource PATCH Requests', () => {
  let userState: State<User>;
  const patchedUserData = { name: 'Patched Name' };

  beforeAll(async () => {
    const setup = await setupUserState();
    userState = setup.userState;
    expect(userState).toBeDefined();
  });

  beforeEach(async () => {
    clearAllMocks();
  });

  it('should send PATCH request with 200 and cache state', async () => {
    const link: Link = {
      ...halUser._links.self,
      context: mockClient.bookmarkUri,
      rel: 'self',
    };

    const patchedUser = {
      id: '1',
      name: 'Patched Name',
      email: 'z891853602@gmail.com',
      _links: {
        self: {
          href: '/api/users/1',
        },
      },
    };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(patchedUser),
      status: 200,
    } as unknown as Response;

    const customHeaders = {
      'X-Custom-Header': 'custom-value',
      Authorization: 'Bearer token123',
    };

    const options: RequestInit = {
      method: 'PATCH',
      headers: new Headers({
        'Content-Type': 'application/json',
        ...customHeaders,
      }),
      body: JSON.stringify(patchedUserData),
    };

    vi.spyOn(mockClient, 'go').mockReturnValue(new Resource(mockClient, link));
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      mockResponse,
    );

    const state = await userState
      .follow('self')
      .withPatch()
      .request({ data: patchedUserData, headers: customHeaders });

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://www.test.com/api/users/1',
      options,
    );

    expect(mockClient.cacheState).toHaveBeenCalledWith(state);
  });

  it('should not cache state when response status is not 200', async () => {
    const link: Link = {
      ...halUser._links.self,
      context: mockClient.bookmarkUri,
      rel: 'self',
    };

    const patchedUser = {
      id: '1',
      name: 'Patched Name',
      email: 'z891853602@gmail.com',
      _links: {
        self: {
          href: '/api/users/1',
        },
      },
    };

    const mockResponse = {
      url: resolve(link).toString(),
      json: vi.fn().mockResolvedValue(patchedUser),
      status: 204, // No Content
    } as unknown as Response;

    vi.spyOn(mockClient, 'go').mockReturnValue(new Resource(mockClient, link));
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      mockResponse,
    );

    await userState
      .follow('self')
      .withPatch()
      .request({ data: patchedUserData });

    expect(mockClient.cacheState).not.toHaveBeenCalled();
  });
});
