import { describe, expect, it, vi } from 'vitest';
import { ClientInstance } from '../../lib/client-instance.js';
import { Entity } from '../../lib/archtype/entity.js';
import Resource from '../../lib/resource/resource.js';

describe('Resource HEAD Requests', () => {
  it('should return full cache when available', async () => {
    const cacheState = {
      uri: 'https://api.example.com/users/1',
      isPartial: false,
    };
    const mockClient = {
      bookmarkUri: 'https://api.example.com',
      fetcher: { fetchOrThrow: vi.fn() },
      cache: { get: vi.fn().mockReturnValue(cacheState) },
      getHeadStateForResponse: vi.fn(),
    } as unknown as ClientInstance;

    const resource = new Resource<Entity>(mockClient, {
      rel: '',
      href: '/users/1',
      context: mockClient.bookmarkUri,
    });

    const state = await resource.head();

    expect(state).toBe(cacheState);
    expect(mockClient.fetcher.fetchOrThrow).not.toHaveBeenCalled();
    expect(mockClient.getHeadStateForResponse).not.toHaveBeenCalled();
  });

  it('should perform HEAD and convert response to head state when cache is missing', async () => {
    const response = new Response(null, {
      status: 200,
      headers: new Headers({
        Link: '</users/2>; rel="next"',
      }),
    });
    const headState = {
      uri: 'https://api.example.com/users/1',
      follow: vi.fn(),
    };
    const mockClient = {
      bookmarkUri: 'https://api.example.com',
      fetcher: { fetchOrThrow: vi.fn().mockResolvedValue(response) },
      cache: { get: vi.fn().mockReturnValue(null) },
      getHeadStateForResponse: vi.fn().mockReturnValue(headState),
    } as unknown as ClientInstance;

    const link = {
      rel: '',
      href: '/users/1',
      context: mockClient.bookmarkUri,
    };
    const resource = new Resource<Entity>(mockClient, link);

    const state = await resource.head();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      'https://api.example.com/users/1',
      {
        method: 'HEAD',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      },
    );
    expect(mockClient.getHeadStateForResponse).toHaveBeenCalledWith(
      link,
      response,
    );
    expect(state).toBe(headState);
  });
});
