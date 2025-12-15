import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { Link } from '../../lib/links/link.js';
import { Resource, State } from '../../lib/index.js';
import { resolve } from '../../lib/util/uri.js';
import { mockClient, setupUserState, clearAllMocks } from './mock-setup.js';

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

    await userState.follow('self').withMethod('PUT').request({
      data: updatedUserData,
      headers: customHeaders,
    });

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://www.test.com/api/users/1',
      options,
    );
  });
});
