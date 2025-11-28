import { describe, expect, vi, beforeEach } from 'vitest';
import { Fetcher } from '../../lib/http/fetcher.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Fetcher', () => {
  let fetcher: Fetcher;

  beforeEach(() => {
    fetcher = new Fetcher();
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(fetcher).toBeDefined();
  });

  it('should call fetch with string resource', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const resource = 'https://api.example.com/data';
    const result = await fetcher.fetch(resource);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResponse);

    const fetchCall = mockFetch.mock.calls[0][0];
    expect(fetchCall).toBeInstanceOf(Request);
    expect(fetchCall.url).toBe(resource);
    expect(fetchCall.method).toBe('GET');
  });

  it('should call fetch with Request object', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const request = new Request('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' })
    });

    const result = await fetcher.fetch(request);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResponse);

    const fetchCall = mockFetch.mock.calls[0][0];
    expect(fetchCall).toBeInstanceOf(Request);
    expect(fetchCall.url).toBe(request.url);
    expect(fetchCall.method).toBe('POST');
  });

  it('should call fetch with string resource and init options', async () => {
    const mockResponse = { ok: true, status: 201 } as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const resource = 'https://api.example.com/data';
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' })
    };

    const result = await fetcher.fetch(resource, init);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResponse);

    const fetchCall = mockFetch.mock.calls[0][0];
    expect(fetchCall).toBeInstanceOf(Request);
    expect(fetchCall.url).toBe(resource);
    expect(fetchCall.method).toBe('POST');
    expect(fetchCall.headers.get('Content-Type')).toBe('application/json');
  });

  it('should handle fetch errors', async () => {
    const error = new Error('Network error');
    mockFetch.mockRejectedValue(error);

    const resource = 'https://api.example.com/data';

    await expect(fetcher.fetch(resource)).rejects.toThrow('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle different HTTP methods', async () => {
    const mockResponse = { ok: true, status: 204 } as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const resource = 'https://api.example.com/data';
    const init: RequestInit = { method: 'DELETE' };

    await fetcher.fetch(resource, init);

    const fetchCall = mockFetch.mock.calls[0][0];
    expect(fetchCall.method).toBe('DELETE');
  });

  it('should handle custom headers', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const resource = 'https://api.example.com/data';
    const init: RequestInit = {
      headers: {
        'Authorization': 'Bearer token123',
        'X-Custom-Header': 'custom-value'
      }
    };

    await fetcher.fetch(resource, init);

    const fetchCall = mockFetch.mock.calls[0][0];
    expect(fetchCall.headers.get('Authorization')).toBe('Bearer token123');
    expect(fetchCall.headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('should handle request with body', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const resource = 'https://api.example.com/data';
    const bodyData = { title: 'New Item', content: 'Item content' };
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    };

    await fetcher.fetch(resource, init);

    const fetchCall = mockFetch.mock.calls[0][0];
    expect(fetchCall.method).toBe('POST');
    expect(fetchCall.headers.get('Content-Type')).toBe('application/json');
  });

  it('should handle request with query parameters in URL', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    mockFetch.mockResolvedValue(mockResponse);

    const resource = 'https://api.example.com/data?page=1&limit=10&sort=name';

    await fetcher.fetch(resource);

    const fetchCall = mockFetch.mock.calls[0][0];
    expect(fetchCall.url).toBe(resource);
  });
});
