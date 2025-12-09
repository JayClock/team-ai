import { describe, expect } from 'vitest';
import mockUser from './fixtures/hal-user.json' with { type: 'json' };
import { HalResource } from 'hal-types';
import { State } from '../lib/state/state.js';
import { HalState } from '../lib/state/hal-state.js';
import { User } from './fixtures/interface.js';
import { SafeAny } from '../lib/archtype/safe-any.js';
import { ClientInstance } from '../lib/client-instance.js';

const mockClient = {} as ClientInstance;

describe('HalState', () => {
  const state = HalState.create(mockClient, '/api/users/1', mockUser as HalResource) as HalState<User>;

  it('should get pure data with out hal info', () => {
    expect(state.data).toEqual({
      id: '1',
      name: 'JayClock',
      email: 'z891853602@gmail.com'
    });
  });


  it('should throw error with not existed link', () => {
    expect(() => state.follow('not existed' as SafeAny)).toThrow(
      `rel not existed is not exited`
    );
  });

  it('should create collection with existed embedded', () => {
    const state = HalState.create(mockClient, '/api/users/1', mockUser as HalResource, 'accounts');
    expect(state.collection.length).toEqual(mockUser._embedded.accounts.length);
  });

  it('should create forms with existed templates', () => {
    expect(state.getForm('create-conversation')?.uri).toEqual(mockUser._templates['create-conversation'].target);
  });

  it('should get multi state in embedded', () => {
    expect((state.getEmbedded('accounts') as State[]).length).toEqual(mockUser._embedded.accounts.length);
  });
  it('should clone state', () => {
    const cloned = state.clone();
    expect(cloned).toBeInstanceOf(HalState);
    expect(cloned).not.toBe(state);
    expect(cloned.uri).toEqual(state.uri);
    expect(cloned.data).toEqual(state.data);
  });
});
