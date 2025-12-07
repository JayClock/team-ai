import { describe, expect } from 'vitest';
import { HalState } from '../../lib/state/hal-state.js';
import { Client } from '../../lib/client.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
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

  it('should get accounts array from state embedded', async () => {
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
});
