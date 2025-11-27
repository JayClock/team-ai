import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'inversify';
import { Fetcher } from '../../lib/http/fetcher.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import type { Config } from '../../lib/archtype/config.js';

global.fetch = vi.fn();

describe('Fetcher', () => {
  let container: Container;
  let mockConfig: Config;
  let fetcher: Fetcher;

  beforeEach(() => {
    container = new Container();
    mockConfig = { baseURL: 'https://api.example.com' };
    container.bind<Config>(TYPES.Config).toConstantValue(mockConfig);
    container.bind<Fetcher>(TYPES.Fetcher).to(Fetcher);
    fetcher = container.get<Fetcher>(TYPES.Fetcher);
    vi.clearAllMocks();
  });

  it('should be instantiated with config', () => {
    expect(fetcher).toBeInstanceOf(Fetcher);
  });

  it('should call fetch with concatenated URL when input is string', async () => {
    const mockResponse = new Response('{"data": "test"}');
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const input = '/users';
    const init: RequestInit = { method: 'GET' };

    await fetcher.fetch(input, init);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      init
    );
  });

  it('should call fetch with concatenated URL when input is URL object', async () => {
    const mockResponse = new Response('{"data": "test"}');
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const input = new URL('/users', 'https://api.example.com');
    const init: RequestInit = { method: 'GET' };

    await fetcher.fetch(input, init);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.comhttps://api.example.com/users',
      init
    );
  });

  it('should call fetch with concatenated URL when input is Request object', async () => {
    const mockResponse = new Response('{"data": "test"}');
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const input = new Request('https://api.example.com/users', {
      method: 'GET',
    });
    const init: RequestInit = {
      headers: { 'Content-Type': 'application/json' },
    };

    await fetcher.fetch(input, init);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com[object Request]',
      init
    );
  });

  it('should call fetch without init when init is not provided', async () => {
    const mockResponse = new Response('{"data": "test"}');
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const input = '/users';

    await fetcher.fetch(input);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      undefined
    );
  });

  it('should return the response from fetch', async () => {
    const mockResponse = new Response('{"data": "test"}', { status: 200 });
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const input = '/users';
    const result = await fetcher.fetch(input);

    expect(result).toBe(mockResponse);
    expect(result.status).toBe(200);
  });

  it('should handle different baseURL configurations', async () => {
    await container.unbind(TYPES.Config);
    const differentConfig = { baseURL: 'https://different.api.com' };
    container.bind<Config>(TYPES.Config).toConstantValue(differentConfig);

    const differentFetcher = container.get<Fetcher>(TYPES.Fetcher);

    const mockResponse = new Response('{"data": "test"}');
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    await differentFetcher.fetch('/test');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://different.api.com/test',
      undefined
    );
  });

  it('should handle empty baseURL', async () => {
    await container.unbind(TYPES.Config);
    const emptyConfig = { baseURL: '' };
    container.bind<Config>(TYPES.Config).toConstantValue(emptyConfig);

    const emptyBaseURLFetcher = container.get<Fetcher>(TYPES.Fetcher);

    const mockResponse = new Response('{"data": "test"}');
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    await emptyBaseURLFetcher.fetch('/test');

    expect(global.fetch).toHaveBeenCalledWith('/test', undefined);
  });

  it('should handle baseURL with trailing slash', async () => {
    await container.unbind(TYPES.Config);
    const trailingSlashConfig = { baseURL: 'https://api.example.com/' };
    container.bind<Config>(TYPES.Config).toConstantValue(trailingSlashConfig);

    const trailingSlashFetcher = container.get<Fetcher>(TYPES.Fetcher);

    const mockResponse = new Response('{"data": "test"}');
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);
    await trailingSlashFetcher.fetch('/test');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com//test',
      undefined
    );
  });
});
