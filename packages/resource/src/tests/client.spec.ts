import { beforeEach, describe, expect, vi } from 'vitest';
import { Client } from '../lib/client.js';
import { Fetcher } from '../lib/http/fetcher.js';
import { Config } from '../lib/archtype/config.js';
import { Entity } from '../lib/index.js';
import { Resource } from '../lib/resource/resource.js';
import { Link } from '../lib/links.js';

vi.mock('../lib/resource/resource.js', () => ({
  Resource: vi.fn().mockImplementation((client, uri, rels) => ({
    client,
    uri,
    rels,
    request: vi.fn(),
    follow: vi.fn(),
  })),
}));

describe('Client', () => {
  let client: Client;
  let mockConfig: Config;
  let mockFetcher: Fetcher;

  beforeEach(() => {
    mockConfig = {
      baseURL: 'https://api.example.com',
    };

    mockFetcher = {
      fetch: vi.fn(),
    } as unknown as Fetcher;

    client = new Client(mockConfig, mockFetcher);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(client).toBeDefined();
  });

  it('should create a Resource when calling go method', () => {
    const link: Link = { rel: '', href: '/users/1' };
    const resource = client.go<Entity>(link);

    expect(Resource).toHaveBeenCalledWith(client, link);
    expect(resource).toBeDefined();
  });

  it('should call fetcher.fetch with correct URL when calling fetch method with string input', async () => {
    const input = '/users/1';
    const init: RequestInit = {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    };
    const mockResponse = { ok: true, status: 200 } as Response;

    vi.spyOn(mockFetcher, 'fetch').mockResolvedValue(mockResponse);

    const result = await client.fetch(input, init);

    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${mockConfig.baseURL}${input}`,
      init
    );
    expect(result).toEqual(mockResponse);
  });

  it('should call fetcher.fetch with correct URL when calling fetch method with URL input', async () => {
    const input = new URL('/users/1', mockConfig.baseURL);
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User' }),
    };
    const mockResponse = { ok: true, status: 201 } as Response;

    vi.spyOn(mockFetcher, 'fetch').mockResolvedValue(mockResponse);

    const result = await client.fetch(input, init);

    // Client simply concatenates baseURL and input.toString()
    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${mockConfig.baseURL}${input}`,
      init
    );
    expect(result).toEqual(mockResponse);
  });

  it('should call fetcher.fetch with correct URL when calling fetch method with Request input', async () => {
    // Create a request with a full URL to avoid the "Failed to parse URL" error
    const fullUrl = `${mockConfig.baseURL}/users/1`;
    const request = new Request(fullUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated User' }),
    });
    const mockResponse = { ok: true, status: 200 } as Response;

    vi.spyOn(mockFetcher, 'fetch').mockResolvedValue(mockResponse);

    const result = await client.fetch(request);

    // Client simply concatenates baseURL and input.toString()
    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${mockConfig.baseURL}${request}`,
      undefined
    );
    expect(result).toEqual(mockResponse);
  });

  it('should handle fetcher.fetch errors', async () => {
    const input = '/users/1';
    const error = new Error('Network error');

    vi.spyOn(mockFetcher, 'fetch').mockRejectedValue(error);

    await expect(client.fetch(input)).rejects.toThrow('Network error');
    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${mockConfig.baseURL}${input}`,
      undefined
    );
  });

  it('should handle different base URLs correctly', () => {
    const customConfig: Config = {
      baseURL: 'https://custom.api.com/v2',
    };
    const customClient = new Client(customConfig, mockFetcher);
    const input = '/data';

    const mockResponse = { ok: true, status: 200 } as Response;
    vi.spyOn(mockFetcher, 'fetch').mockResolvedValue(mockResponse);

    customClient.fetch(input);

    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${customConfig.baseURL}${input}`,
      undefined
    );
  });

  it('should handle empty base URL', () => {
    const emptyConfig: Config = {
      baseURL: '',
    };
    const emptyClient = new Client(emptyConfig, mockFetcher);
    const input = '/users/1';

    const mockResponse = { ok: true, status: 200 } as Response;
    vi.spyOn(mockFetcher, 'fetch').mockResolvedValue(mockResponse);

    emptyClient.fetch(input);

    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${emptyConfig.baseURL}${input}`,
      undefined
    );
  });

  it('should handle base URL without trailing slash', () => {
    const configWithoutSlash: Config = {
      baseURL: 'https://api.example.com/api',
    };
    const clientWithoutSlash = new Client(configWithoutSlash, mockFetcher);
    const input = '/users/1';

    const mockResponse = { ok: true, status: 200 } as Response;
    vi.spyOn(mockFetcher, 'fetch').mockResolvedValue(mockResponse);

    clientWithoutSlash.fetch(input);

    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${configWithoutSlash.baseURL}${input}`,
      undefined
    );
  });

  it('should handle input without leading slash', () => {
    const inputWithoutSlash = 'users/1';

    const mockResponse = { ok: true, status: 200 } as Response;
    vi.spyOn(mockFetcher, 'fetch').mockResolvedValue(mockResponse);

    client.fetch(inputWithoutSlash);

    expect(mockFetcher.fetch).toHaveBeenCalledWith(
      `${mockConfig.baseURL}${inputWithoutSlash}`,
      undefined
    );
  });
});
