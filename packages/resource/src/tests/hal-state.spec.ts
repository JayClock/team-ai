import { describe, expect } from 'vitest';
import { Client, Relation } from '../lib/index.js';
import mockUser from './fixtures/hal-user.json' with { type: 'json' };
import { HalState } from '../lib/state/hal.js';
import { HalResource } from 'hal-types';

const mockClient = {
  go: vi.fn()
} as unknown as Client;

describe('HalState', () => {
  const state = new HalState(mockClient, '/api/users/1', mockUser as HalResource);

  it('should get pure data with out hal info', () => {
    expect(state.data).toEqual({
      id: '1',
      name: 'JayClock',
      email: 'z891853602@gmail.com'
    });
  });

  it('should get follow resource with existed link', () => {
    for (const [rel] of Object.entries(mockUser._links ?? [])) {
      const relation = state.follow(rel as any);
      expect(relation).toBeInstanceOf(Relation);
    }
  });

  it('should throw error with not existed link', () => {
    expect(() => state.follow('not existed')).toThrow(
      `rel not existed is not exited`
    );
  });
});
