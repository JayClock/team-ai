import { describe, expect, vi } from 'vitest';
import { Account, User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halAccounts from '../fixtures/hal-accounts.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { HalResource } from 'hal-types';
import { LinkResource } from '../../lib/resource/link-resource.js';
import { HalState } from '../../lib/state/hal-state.js';
import { Collection } from '../../lib/index.js';
import { Axios } from 'axios';

const mockAxios = {
  request: vi.fn()
} as unknown as Axios;

describe('Resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle root resource request with embedded', async () => {
    vi.spyOn(mockAxios, 'request').mockResolvedValue({ data: halAccounts });

    const rootResource = new LinkResource<Collection<Account>>(mockAxios, {
      rel: 'accounts',
      href: '/api/users/1/accounts'
    }).withRequestOptions({ body: { page: 1 } });

    const result = await rootResource.request();

    expect(mockAxios.request).toHaveBeenCalledWith({
      url: '/api/users/1/accounts',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      data: { page: 1 }
    });
    expect(result.collection.length).toEqual(halAccounts._embedded.accounts.length);
  });


  it('should handle embedded array resource request', async () => {
    vi.spyOn(mockAxios, 'request').mockResolvedValue({ data: halUser });

    const userState = new LinkResource(mockAxios, { rel: '', href: '/api/users/1' });

    const accountsResource = userState.follow('accounts');
    const result = await accountsResource.request();

    expect(result.collection).toHaveLength(2);
    expect(result.uri).toBe('/api/users/1/accounts');

    const firstAccount = result.collection[0] as HalState<Account>;
    expect(firstAccount.data.id).toBe('1');
    expect(firstAccount.data.provider).toBe('github');
    expect(firstAccount.data.providerId).toBe('35857909');
  });

  it('should handle embedded single resource request', async () => {
    vi.spyOn(mockAxios, 'request').mockResolvedValue({ data: halUser });

    const userState = new LinkResource(mockAxios, { rel: '', href: '/api/users/1' });

    const latestConversationResource = userState.follow('latest-conversation');
    const result = await latestConversationResource.request();

    expect(result.data.id).toBe('conv-456');
    expect(result.data.title).toBe('Recent chat about HATEOAS');
    expect(result.uri).toBe('/api/conversations/conv-456');
  });

  it('should handle non-embedded resource request with HTTP call', async () => {
    const userState = HalState.create<User>(
      mockAxios,
      '/api/users/1',
      halUser as HalResource
    );

    vi.spyOn(mockAxios, 'request').mockResolvedValue({ data: halConversations });

    const conversationsResource = userState.follow('conversations').withRequestOptions({
      query: {
        page: 1,
        pageSize: 10
      }
    });
    const result = await conversationsResource.request();

    expect(mockAxios.request).toHaveBeenCalledWith({
      url: '/api/users/1/conversations?page=1&pageSize=10',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    expect(result.collection).toHaveLength(40);
    expect(result.uri).toBe('/api/users/1/conversations?page=1&pageSize=10');
  });
});
