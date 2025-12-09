import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { halStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { State } from '../../lib/state/state.js';

const mockFetcher = {
  fetchOrThrow: vi.fn()
};

const mockClient = {
  fetcher: mockFetcher,
  getStateForResponse: vi.fn()
} as unknown as ClientInstance;

describe('StateResource', () => {
  let userState: State<User>;

  beforeEach(async () => {
    userState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      Response.json(halUser)
    );
    vi.clearAllMocks();
  });

  it('should generate states from user embedded accounts array', async () => {
    userState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      Response.json(halUser)
    );

    const accountsResource = userState.follow('accounts');
    await accountsResource.request();

    const accounts = halUser._embedded.accounts;
    expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
      halUser._links.accounts.href,
      expect.any(Response),
      'accounts'
    );
    const mockedGetStateForResponse = vi.mocked(mockClient.getStateForResponse);
    const mockCall = mockedGetStateForResponse.mock.calls[0];
    const response = mockCall[1];
    const responseData = await response.json();
    expect(responseData).toEqual({
      _embedded: { accounts }
    });
  });

  it('should generate states from user embedded latest-conversation', async () => {
    const latestConversationResource = userState.follow('latest-conversation');
    await latestConversationResource.request();

    expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
      halUser._links['latest-conversation'].href,
      expect.any(Response)
    );

    const mockedGetStateForResponse = vi.mocked(mockClient.getStateForResponse);
    const mockCall = mockedGetStateForResponse.mock.calls[0];
    const response = mockCall[1];
    const responseData = await response.json();
    expect(responseData).toEqual(
      halUser._embedded['latest-conversation']
    );
  });

  it('should handle non-embedded resource request with HTTP call', async () => {
    const mockResponse = {
      url: 'https://www.test.com/api/users/1/conversations?page=1&pageSize=10',
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    const userState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      Response.json(halUser)
    );

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const link: Link = { ...halUser._links.conversations, rel: 'conversations', type: 'GET' };

    const options = {
      query: {
        page: 1,
        pageSize: 10
      }
    };
    const conversationsResource = userState.follow('conversations').withRequestOptions(options);
    await conversationsResource.request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(link, options);

    expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
      '/api/users/1/conversations?page=1&pageSize=10',
      mockResponse,
      'conversations'
    );
  });

  it('should verify request body with hal template', async () => {
    const userState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      Response.json(halUser)
    );
    await expect(userState.follow('create-conversation').withRequestOptions({ body: { title: 123 } }).request()).rejects.toThrow('Invalid');
  });
});
