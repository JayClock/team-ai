import { describe, expect } from 'vitest';
import { Client, State } from '../lib/index.js';
import { HalResource } from 'hal-types';

const mockClient = {
  go: vi.fn(),
} as unknown as Client;
const mockData: HalResource = {
  id: '1',
  name: 'JayClock',
  email: 'z891853602@gmail.com',
  _links: {
    self: {
      href: '/api/users/1',
    },
    accounts: {
      href: '/api/users/1/accounts',
    },
    conversations: {
      href: '/api/users/1/conversations',
    },
    'create-conversation': {
      href: '/api/users/1/conversations',
    },
  },
};

describe('State', () => {
  const state = new State({
    client: mockClient,
    uri: '/api/users/1',
    data: mockData,
  });

  it('should get pure data with out hal info', () => {
    expect(state.data).toEqual({
      id: '1',
      name: 'JayClock',
      email: 'z891853602@gmail.com',
    });
  });

  it('should get follow resource with existed link', () => {
    for (const [rel, links] of Object.entries(mockData._links ?? [])) {
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
});
