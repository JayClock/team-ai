import { describe, expect } from 'vitest';
import { createClient } from '../lib/index.js';
import { User } from './fixtures/interface.js';
import halUser from './fixtures/hal-user.json' with { type: 'json' };
import halConversations from './fixtures/hal-conversations.json' with { type: 'json' };

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { resolve } from '../lib/util/uri.js';

const handlers = [
  http.get('https://api.example.com/api/users/1', () => {
    return HttpResponse.json(halUser);
  }),
  http.get(
    'https://api.example.com/api/users/1/conversations?page=1&pageSize=10',
    () => {
      return HttpResponse.json(halConversations);
    },
  ),
  http.get('https://api.example.com/api/file', () => {
    const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    return new HttpResponse(binaryData, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': binaryData.length.toString(),
      },
    });
  }),
];

const server = setupServer(...handlers);

describe('Client', () => {
  const baseURL = 'https://api.example.com/';
  const client = createClient({ baseURL: baseURL });

  const userResource = client.go<User>({ rel: '', href: '/api/users/1' });

  beforeAll(() => server.listen());

  it('should get user data', async () => {
    const res = await userResource.request();
    expect(halUser).toEqual(expect.objectContaining(res.data));
  });

  it('should get user data with multi follow', async () => {
    const res = await userResource
      .follow('latest-conversation')
      .follow('user')
      .withMethod('GET')
      .request();
    expect(halUser).toEqual(expect.objectContaining(res.data));
  });

  it('should get user accounts data', async () => {
    const res = await userResource.follow('accounts').request();
    expect(res.collection.length).toEqual(halUser._embedded.accounts.length);
    expect(res.uri).toEqual(
      resolve(baseURL, '/api/users/1/accounts').toString(),
    );
    const firstAccount = res.collection[0];
    expect(firstAccount.data.id).toBe('1');
    expect(firstAccount.data.provider).toBe('github');
    expect(firstAccount.data.providerId).toBe('35857909');
  });

  it('should get user conversations data', async () => {
    const res = await userResource
      .follow('conversations')
      .withTemplateParameters({
        page: 1,
        pageSize: 10,
      })
      .request();
    expect(res.collection.length).toEqual(
      halConversations._embedded.conversations.length,
    );
    expect(res.uri).toBe(
      resolve(
        baseURL,
        '/api/users/1/conversations?page=1&pageSize=10',
      ).toString(),
    );
  });

  it('should get user file data with binary', async () => {
    const res = await userResource.follow('file').request();
    const text = await res.data.text();
    expect(text).toBe('Hello');
  });

  afterEach(() => server.resetHandlers());

  afterAll(() => server.close());
});
