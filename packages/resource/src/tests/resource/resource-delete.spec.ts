import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { Link } from '../../lib/links/link.js';
import { Resource, State } from '../../lib/index.js';
import { clearAllMocks, mockClient, setupUserState } from './mock-setup.js';

describe('Resource DELETE Requests', () => {
  let userState: State<User>;

  beforeAll(async () => {
    const setup = await setupUserState();
    userState = setup.userState;
    expect(userState).toBeDefined();
  });

  beforeEach(async () => {
    clearAllMocks();
  });

  it('should send DELETE request with correct parameters', async () => {
    const link: Link = {
      ...halUser._links.self,
      context: mockClient.bookmarkUri,
      rel: 'self',
    };

    const mockResponse = {
      status: 204,
    } as unknown as Response;

    const options: RequestInit = {
      method: 'DELETE',
      headers: new Headers({ 'Content-Type': 'application/json' }),
    };

    vi.spyOn(mockClient, 'go').mockReturnValue(new Resource(mockClient, link));
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      mockResponse,
    );

    await userState.follow('self').withDelete().request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://www.test.com/api/users/1',
      options,
    );
    expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
      link,
      mockResponse,
    );
  });
});
