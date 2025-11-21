import { describe, expect } from 'vitest';
import { HalState, Client } from '../lib/index.js';
import mockUser from './fixtures/hal-user.json' with { type: 'json' };
import { HalResource } from 'hal-types';
import { HalStateFactory } from '../lib/state/hal.js';
import { State } from '../lib/state/interface.js';

const mockClient = {
  go: vi.fn()
} as unknown as Client;

describe('HalState', () => {
  const state = HalStateFactory(mockClient, '/api/users/1', mockUser as HalResource) as HalState;

  it('should get pure data with out hal info', () => {
    expect(state.data).toEqual({
      id: '1',
      name: 'JayClock',
      email: 'z891853602@gmail.com'
    });
  });

  it('should get follow relation with existed link', () => {
    for (const [rel] of Object.entries(mockUser._links ?? [])) {
      const relation = state.follow(rel);
      expect(relation.rels).toEqual([rel]);
    }
  });

  it('should throw error with not existed link', () => {
    expect(() => state.follow('not existed')).toThrow(
      `rel not existed is not exited`
    );
  });

  it('should create collection with existed embedded', () => {
    const state = HalStateFactory(mockClient, '/api/users/1', mockUser as HalResource, 'accounts');
    expect(state.collection.length).toEqual(mockUser._embedded.accounts.length);
  });

  it('should create forms with existed templates', () => {
    expect(state.getForm('conversations', 'POST')?.uri).toEqual(mockUser._templates['create-conversation'].target);
  });

  it('should get single state in embedded', () => {
    expect(state.getEmbedded('latest-conversation')).toBeInstanceOf(HalState);
  });

  it('should get multi state in embedded', () => {
    expect((state.getEmbedded('accounts') as State[]).length).toEqual(mockUser._embedded.accounts.length);
  });
});
