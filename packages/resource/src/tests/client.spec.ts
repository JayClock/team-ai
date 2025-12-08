import { describe, expect } from 'vitest';
import { createClient } from '../lib/index.js';
import { User } from './fixtures/interface.js';
import halUser from './fixtures/hal-user.json' with { type: 'json' };
import halConversations from './fixtures/hal-conversations.json' with { type: 'json' };


import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';


const handlers = [
  http.get('https://api.example.com/api/users/1', () => {
    return HttpResponse.json(halUser);
  }),
  http.get('https://api.example.com/api/users/1/conversations?page=1&pageSize=10', () => {
    return HttpResponse.json(halConversations);
  })
];

const server = setupServer(...handlers);


describe('Client', () => {
  const client = createClient({ baseURL: 'https://api.example.com/' });

  const userResource = client.go<User>({ rel: '', href: '/api/users/1' });

  beforeAll(() => server.listen());


  it('should get user data', async () => {
    const res = await userResource.request();
    expect(res.data.id).toEqual(halUser.id);
    expect(res.data.name).toEqual(halUser.name);
    expect(res.data.email).toEqual(halUser.email);
  });

  it('should get user accounts data', async () => {
    const res = await userResource.follow('accounts').request();
    expect(res.collection.length).toEqual(halUser._embedded.accounts.length);
    expect(res.uri).toEqual('/api/users/1/accounts');
    const firstAccount = res.collection[0];
    expect(firstAccount.data.id).toBe('1');
    expect(firstAccount.data.provider).toBe('github');
    expect(firstAccount.data.providerId).toBe('35857909');
  });

  it('should get user conversations data', async () => {
    const res = await userResource.follow('conversations').withRequestOptions({
      query: {
        page: 1,
        pageSize: 10
      }
    }).request();
    expect(res.collection.length).toEqual(halConversations._embedded.conversations.length);
    expect(res.uri).toBe('/api/users/1/conversations?page=1&pageSize=10');
  });

  afterEach(() => server.resetHandlers());

  afterAll(() => server.close());
});
