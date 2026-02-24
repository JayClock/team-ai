import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useReadResource } from '../../lib/hooks/use-read-resource';
import { mockClient, wrapper } from './wrapper';

interface TestEntity extends Entity {
  data: {
    id: string;
    name: string;
  };
  links: {
    self: TestEntity;
  };
}

type MockFn = ReturnType<typeof vi.fn>;

type MockResourceControl = {
  resource: Resource<TestEntity>;
  get: MockFn;
  refresh: MockFn;
  on: MockFn;
  off: MockFn;
  emitUpdate(state: State<TestEntity>): void;
  emitStale(): void;
};

function createMockState(
  uri = '/api/test',
): { state: State<TestEntity>; clone: MockFn } {
  const clone = vi.fn();
  const state = {
    data: { id: '1', name: 'Test' },
    timestamp: Date.now(),
    uri,
    clone,
  } as unknown as State<TestEntity>;

  clone.mockImplementation(() => state);
  return { state, clone };
}

function createMockResource(state: State<TestEntity>): MockResourceControl {
  const updateListeners = new Set<(nextState: State<TestEntity>) => void>();
  const staleListeners = new Set<() => void>();

  const get = vi.fn().mockResolvedValue(state);
  const refresh = vi.fn().mockResolvedValue(state);

  const resource = {
    uri: state.uri,
    get,
    refresh,
  } as unknown as Resource<TestEntity>;

  const on = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'update') {
      updateListeners.add(listener as (nextState: State<TestEntity>) => void);
    }
    if (event === 'stale') {
      staleListeners.add(listener as () => void);
    }
    return resource;
  });

  const off = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'update') {
      updateListeners.delete(listener as (nextState: State<TestEntity>) => void);
    }
    if (event === 'stale') {
      staleListeners.delete(listener as () => void);
    }
    return resource;
  });

  (resource as unknown as { on: MockFn }).on = on;
  (resource as unknown as { off: MockFn }).off = off;

  const emitUpdate = (nextState: State<TestEntity>) => {
    for (const listener of updateListeners) {
      listener(nextState);
    }
  };

  const emitStale = () => {
    for (const listener of staleListeners) {
      listener();
    }
  };

  return { resource, get, refresh, on, off, emitUpdate, emitStale };
}

describe('useReadResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockClient.cache.get as unknown as MockFn).mockReturnValue(null);
  });

  it('supports calling without options and stays idle for null resource', () => {
    const { result } = renderHook(
      () => useReadResource(null as unknown as Resource<TestEntity>),
      { wrapper },
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);
    expect(result.current.resource).toBe(null);
    expect(mockClient.cache.get).not.toHaveBeenCalled();
  });

  it('uses cached state and skips initial get request', async () => {
    const { state } = createMockState('/api/users/1');
    const mockResource = createMockResource(state);
    (mockClient.cache.get as unknown as MockFn).mockReturnValue(state);

    const { result } = renderHook(() => useReadResource(mockResource.resource), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockResource.get).not.toHaveBeenCalled();
    expect(result.current.resourceState).toBe(state);
    expect(result.current.error).toBe(null);
  });

  it('passes initial headers to get and updates from update events', async () => {
    const { state, clone } = createMockState('/api/users/1');
    const mockResource = createMockResource(state);
    const headers = { Authorization: 'Bearer token' };

    mockResource.get.mockImplementation(async () => {
      mockResource.emitUpdate(state);
      return state;
    });

    const { result } = renderHook(
      () =>
        useReadResource(mockResource.resource, {
          initialGetRequestHeaders: headers,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockResource.get).toHaveBeenCalledWith({ headers });
    expect(result.current.resourceState.uri).toBe('/api/users/1');
    expect(clone).toHaveBeenCalled();
  });

  it('refreshes on stale when refreshOnStale is enabled', async () => {
    const { state } = createMockState('/api/users/1');
    const mockResource = createMockResource(state);
    (mockClient.cache.get as unknown as MockFn).mockReturnValue(state);

    const { result } = renderHook(
      () =>
        useReadResource(mockResource.resource, {
          refreshOnStale: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      mockResource.emitStale();
    });

    await waitFor(() => {
      expect(mockResource.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('does not refresh on stale by default', async () => {
    const { state } = createMockState('/api/users/1');
    const mockResource = createMockResource(state);
    (mockClient.cache.get as unknown as MockFn).mockReturnValue(state);

    const { result } = renderHook(() => useReadResource(mockResource.resource), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      mockResource.emitStale();
    });

    expect(mockResource.refresh).not.toHaveBeenCalled();
  });

  it('handles initial get errors and unsubscribes listeners on unmount', async () => {
    const { state } = createMockState('/api/users/1');
    const mockResource = createMockResource(state);
    const mockError = new Error('Network error');
    mockResource.get.mockRejectedValue(mockError);

    const { result, unmount } = renderHook(
      () => useReadResource(mockResource.resource),
      {
        wrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(mockError);

    unmount();

    expect(mockResource.off).toHaveBeenCalledWith('update', expect.any(Function));
    expect(mockResource.off).toHaveBeenCalledWith('stale', expect.any(Function));
  });
});
