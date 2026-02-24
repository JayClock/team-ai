import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useSuspenseReadResource } from '../../lib/hooks/use-suspense-read-resource';
import { useSuspenseInfiniteCollection } from '../../lib/hooks/use-suspense-infinite-collection';

vi.mock('../../lib/hooks/use-suspense-read-resource', () => ({
  useSuspenseReadResource: vi.fn(),
}));

interface TestEntity extends Entity {
  data: {
    id: string;
    name: string;
  };
  links: {
    self: TestEntity;
    next: TestEntity;
  };
}

interface TestCollection extends Entity {
  collection: State<TestEntity>[];
  links: {
    self: TestCollection;
    next: TestCollection;
  };
}

function createItem(id: string): State<TestEntity> {
  return {
    uri: `/api/items/${id}`,
    timestamp: Date.now(),
    data: { id, name: `Item ${id}` },
  } as unknown as State<TestEntity>;
}

function createCollectionState(
  items: State<TestEntity>[],
  hasNextPage: boolean,
  nextPageResource?: Resource<TestCollection>,
): State<TestCollection> {
  const state = {
    uri: '/api/items',
    timestamp: Date.now(),
    collection: items,
    hasLink: vi.fn().mockReturnValue(hasNextPage),
  } as unknown as State<TestCollection>;

  if (hasNextPage && nextPageResource) {
    (state as unknown as { follow: ReturnType<typeof vi.fn> }).follow = vi
      .fn()
      .mockReturnValue(nextPageResource);
  }

  return state;
}

describe('useSuspenseInfiniteCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards options and returns initial state', () => {
    const initialItem = createItem('1');
    const initialState = createCollectionState([initialItem], false);
    const resource = { uri: '/api/items' } as Resource<TestCollection>;

    vi.mocked(useSuspenseReadResource).mockReturnValue({
      resourceState: initialState,
      resource,
    });

    const options = {
      refreshOnStale: true,
      initialGetRequestHeaders: { 'x-test': '1' },
    };

    const { result } = renderHook(() =>
      useSuspenseInfiniteCollection(resource, options),
    );

    expect(useSuspenseReadResource).toHaveBeenCalledWith(resource, options);
    expect(result.current.items).toEqual([initialItem]);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('loads next page and appends items', async () => {
    const firstItem = createItem('1');
    const secondItem = createItem('2');

    const nextPageState = createCollectionState([secondItem], false);
    const nextPageResource = {
      get: vi.fn().mockResolvedValue(nextPageState),
    } as unknown as Resource<TestCollection>;
    const initialState = createCollectionState(
      [firstItem],
      true,
      nextPageResource,
    );

    vi.mocked(useSuspenseReadResource).mockReturnValue({
      resourceState: initialState,
      resource: { uri: '/api/items' } as Resource<TestCollection>,
    });

    const { result } = renderHook(() =>
      useSuspenseInfiniteCollection('/api/items'),
    );

    await act(async () => {
      await result.current.loadNextPage();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });

    expect(result.current.items).toEqual([firstItem, secondItem]);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('warns when loading next page without next link', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* empty */
    });

    const initialState = createCollectionState([createItem('1')], false);

    vi.mocked(useSuspenseReadResource).mockReturnValue({
      resourceState: initialState,
      resource: { uri: '/api/items' } as Resource<TestCollection>,
    });

    const { result } = renderHook(() =>
      useSuspenseInfiniteCollection('/api/items'),
    );

    await act(async () => {
      await result.current.loadNextPage();
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'loadNextPage was called, but there was no next page',
    );
    warnSpy.mockRestore();
  });

  it('sets error when next-page loading fails', async () => {
    const nextPageResource = {
      get: vi.fn().mockRejectedValue('boom'),
    } as unknown as Resource<TestCollection>;
    const initialState = createCollectionState(
      [createItem('1')],
      true,
      nextPageResource,
    );

    vi.mocked(useSuspenseReadResource).mockReturnValue({
      resourceState: initialState,
      resource: { uri: '/api/items' } as Resource<TestCollection>,
    });

    const { result } = renderHook(() =>
      useSuspenseInfiniteCollection('/api/items'),
    );

    await act(async () => {
      await result.current.loadNextPage();
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error?.message).toBe('boom');
  });
});
