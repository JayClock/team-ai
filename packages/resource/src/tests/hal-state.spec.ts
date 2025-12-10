import { describe, expect } from 'vitest';
import halUser from './fixtures/hal-user.json' with { type: 'json' };
import { State } from '../lib/state/state.js';
import { BaseState } from '../lib/state/base-state.js';
import { User } from './fixtures/interface.js';
import { SafeAny } from '../lib/archtype/safe-any.js';
import { ClientInstance } from '../lib/client-instance.js';
import { container } from '../lib/container.js';
import { TYPES } from '../lib/archtype/injection-types.js';
import { HalStateFactory } from '../lib/state/hal-state/hal-state.factory.js';

const mockClient = {} as ClientInstance;

describe('HalState', async () => {
  const halStateFactory:HalStateFactory = container.get(TYPES.HalStateFactory);
  const state = await halStateFactory.create(mockClient, '/api/users/1', Response.json(halUser)) as BaseState<User>;

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

  it('should create collection with existed embedded', async () => {
    const state = await halStateFactory.create(mockClient, '/api/users/1', Response.json(halUser), 'accounts');
    expect(state.collection.length).toEqual(halUser._embedded.accounts.length);
  });

  it('should create forms with existed templates', () => {
    expect(state.getForm('create-conversation')?.uri).toEqual(halUser._templates['create-conversation'].target);
  });

  it('should get multi state in embedded', () => {
    expect((state.getEmbedded('accounts') as State[]).length).toEqual(halUser._embedded.accounts.length);
  });
  it('should clone state', () => {
    const cloned = state.clone();
    expect(cloned).toBeInstanceOf(BaseState);
    expect(cloned).not.toBe(state);
    expect(cloned.uri).toEqual(state.uri);
    expect(cloned.data).toEqual(state.data);
  });
});
