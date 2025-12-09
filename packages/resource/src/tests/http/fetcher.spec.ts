import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container } from 'inversify';
import { Fetcher } from '../../lib/http/fetcher.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import type { Config } from '../../lib/archtype/config.js';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const mockConfig: Config = {
  baseURL: 'https://api.example.com',
};

const mockResponseData = {
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
};

const mockHandlers = [
  http.get('https://api.example.com/test', () => {
    return HttpResponse.json(mockResponseData);
  }),
  http.post('https://api.example.com/test', () => {
    return HttpResponse.json(mockResponseData);
  }),
  http.get('https://api.example.com/error', () => {
    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),
];

const server = setupServer(...mockHandlers);

describe('Fetcher', () => {
  let container: Container;
  let fetcher: Fetcher;

  beforeEach(() => {
    container = new Container();
    container.bind<Config>(TYPES.Config).toConstantValue(mockConfig);
    container.bind<Fetcher>(TYPES.Fetcher).to(Fetcher);
    fetcher = container.get<Fetcher>(TYPES.Fetcher);
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('should be instantiated with correct baseURL', () => {
    expect(fetcher).toBeDefined();
  });

  it('should fetch data successfully with GET request', async () => {
    const response = await fetcher.fetch({ rel: '', href: '/test' });

    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.url).toBe('https://api.example.com/test');

    const responseData = await response.json();
    expect(responseData).toEqual(mockResponseData);
  });

  it('should fetch data successfully with POST request', async () => {
    const response = await fetcher.fetch(
      { rel: '', href: '/test', type: 'POST' },
      { body: { name: 'Test User' } }
    );

    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.url).toBe('https://api.example.com/test');

    const responseData = await response.json();
    expect(responseData).toEqual(mockResponseData);
  });

  it('should fetch data successfully with query parameters', async () => {
    const response = await fetcher.fetch(
      { rel: '', href: '/test' },
      { query: { page: 1, pageSize: 10 } }
    );

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.url).toBe(
      'https://api.example.com/test?page=1&pageSize=10'
    );

    const responseData = await response.json();
    expect(responseData).toEqual(mockResponseData);
  });

  it('should fetch data successfully with templated link', async () => {
    const response = await fetcher.fetch(
      { rel: '', href: '/test{?page,pageSize}', templated: true },
      { query: { page: 1, pageSize: 10 } }
    );

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.url).toBe(
      'https://api.example.com/test?page=1&pageSize=10'
    );

    const responseData = await response.json();
    expect(responseData).toEqual(mockResponseData);
  });

  it('should fetch data error with status 404', async () => {
    const response = await fetcher.fetch({ rel: '', href: '/error' });
    expect(response.status).toBe(404);
    expect(response.url).toBe('https://api.example.com/error');
    const responseData = await response.json();
    expect(responseData).toEqual({ error: 'Not found' });
  });
});
