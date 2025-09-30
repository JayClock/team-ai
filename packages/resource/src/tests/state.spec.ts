import { describe, expect } from 'vitest';
import { Client, State } from '../lib/index.js';
import { HalResource } from 'hal-types';

const mockClient = {} as Client;
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

  it('should get links with hal link info', () => {
    expect(state.links.get('self')?.href).toEqual('/api/users/1');
    expect(state.links.get('accounts')?.href).toEqual('/api/users/1/accounts');
    expect(state.links.get('conversations')?.href).toEqual(
      '/api/users/1/conversations'
    );
    expect(state.links.get('create-conversation')?.href).toEqual(
      '/api/users/1/conversations'
    );
  });
});
