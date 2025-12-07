import { describe, expect } from 'vitest';
import { HalState } from '../../lib/state/hal-state.js';
import { Client } from '../../lib/client.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { HalResource } from 'hal-types';
import { Account, User } from '../fixtures/interface.js';
import { StateResource } from '../../lib/resource/state-resource.js';
import { State } from '../../lib/state/state.js';


const mockClient = {
  go: vi.fn(),
  fetch: vi.fn()
} as unknown as Client;

describe('StateResource', () => {
  const userState: State<User> = HalState.create(mockClient, '/api/users/1', halUser as HalResource);
  const resource = new StateResource<User>(mockClient, userState);

  it('should get accounts from state embedded', async () => {
    const result = await resource.follow('accounts').request();
    expect(result.collection.length).toEqual(halUser._embedded.accounts.length);
    const firstAccount = result.collection[0] as HalState<Account>;
    expect(firstAccount.data.id).toBe('1');
    expect(firstAccount.data.provider).toBe('github');
    expect(firstAccount.data.providerId).toBe('35857909');
  });

  it('should get latest conversation from state embedded', async () => {
    const latestConversationResource = resource.follow('latest-conversation');
    const result = await latestConversationResource.request();

    expect(result.data.id).toBe('conv-456');
    expect(result.data.title).toBe('Recent chat about HATEOAS');
    expect(result.uri).toBe('/api/conversations/conv-456');
  });

  it('should get conversations with http call', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    vi.spyOn(mockClient, 'fetch').mockResolvedValue(mockResponse);

    const conversationsResource = resource.follow('conversations').withRequestOptions({
      query: {
        page: 1,
        pageSize: 10
      }
    });
    const result = await conversationsResource.request();

    expect(mockClient.fetch).toHaveBeenCalledWith('/api/users/1/conversations?page=1&pageSize=10', {
      method: 'GET',
      body: undefined,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    expect(result.collection).toHaveLength(40);
    expect(result.uri).toBe('/api/users/1/conversations?page=1&pageSize=10');
  });

  it('should get result with multi follow relation', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue(halUser)
    } as unknown as Response;

    vi.spyOn(mockClient, 'fetch').mockResolvedValue(mockResponse);

    const result = await resource.follow('latest-conversation').follow('user').request();
    expect(result.data.id).toEqual(halUser.id);
    expect(result.data.email).toEqual(halUser.email);
    expect(result.data.name).toEqual(halUser.name);
  });
});
