import { describe, expect } from 'vitest';
import { Client, State } from '../lib/index.js';
import { HalResource } from 'hal-types';
import mockUser from './fixtures/hal-user.json' with { type: 'json' };
import { User } from './fixtures/interface.js';

const mockClient = {
  go: vi.fn()
} as unknown as Client;

describe('State', () => {
  const state = new State<User>({
    client: mockClient,
    uri: '/api/users/1',
    data: mockUser as HalResource
  });

  it('should get pure data with out hal info', () => {
    expect(state.data).toEqual({
      id: '1',
      name: 'JayClock',
      email: 'z891853602@gmail.com'
    });
  });

  it('should get follow resource with existed link', () => {
    for (const [rel, links] of Object.entries(mockUser._links ?? [])) {
      const linkList = Array.isArray(links) ? links : [links];
      state.follow(rel);
      expect(mockClient.go).toHaveBeenCalledWith(linkList[0].href);
    }
  });

  it('should throw error with not existed link', () => {
    expect(() => state.follow('not existed')).toThrow(
      `rel not existed is not exited`
    );
  });

  it('should find template with rel and method', () => {
    expect(state.getTemplate('create-conversation', 'POST')).toEqual(
      mockUser._templates?.['create-conversation']
    );
    expect(state.getTemplate('self', 'PUT')).toEqual(
      mockUser._templates?.['default']
    );
  });

  it('should get single embedded state with link rel', () => {
    const embeddedState = state.getEmbedded('latest-conversation');
    expect(embeddedState?.uri).toEqual('/api/conversations/conv-456');
  });

  it('should get multi embedded state with link rel', () => {
    const embeddedStateList = state.getEmbedded('accounts');
    expect(embeddedStateList?.length).toEqual(2);
    expect(embeddedStateList?.at(0)?.uri).toEqual('/api/users/1/accounts/1');
    expect(embeddedStateList?.at(1)?.uri).toEqual('/api/users/1/accounts/2');
  });
});
