import { describe, expect } from 'vitest';
import { Client } from '../lib/index.js';
import mockUser from './fixtures/hal-user.json' with { type: 'json' };
import { HalResource } from 'hal-types';
import { HalStateFactory } from '../lib/state/hal.js';

const mockClient = {
  go: vi.fn()
} as unknown as Client;

describe('HalState', () => {
  const state = HalStateFactory(mockClient, '/api/users/1', mockUser as HalResource);

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

  it('should create collection with existed embedded', () => {
    const state = HalStateFactory(mockClient, '/api/users/1', mockUser as HalResource, 'accounts');
    expect(state.collection.length).toEqual(mockUser._embedded.accounts.length);
  });
});
