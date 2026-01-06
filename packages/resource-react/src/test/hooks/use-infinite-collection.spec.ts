import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteCollection } from '../../lib/hooks/use-infinite-collection';
import {
  act,
  renderHook,
  RenderHookResult,
  waitFor,
} from '@testing-library/react';
import { wrapper } from './wrapper';
import { Entity, Resource, State } from '@hateoas-ts/resource';

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

function createMockItem(id: string, name: string): State<TestEntity> {
  return {
    data: { id, name },
    timestamp: Date.now(),
    uri: `/api/items/${id}`,
  } as State<TestEntity>;
}

function createMockResourceState(
  collection: State<TestEntity>[],
  hasNextPage: boolean,
  nextPageResource?: Resource<TestCollection>,
): State<TestCollection> {
  const state = {
    collection,
    hasLink: vi.fn(),
    uri: '/api/items',
    timestamp: Date.now(),
  } as unknown as State<TestCollection>;

  (state.hasLink as ReturnType<typeof vi.fn>).mockReturnValue(hasNextPage);

  if (hasNextPage && nextPageResource) {
    (state as any).follow = vi.fn().mockReturnValue(nextPageResource);
  }

  return state;
}

function createMockResource(
  state: State<TestCollection>,
): Resource<TestCollection> {
  const mockRequest = vi.fn().mockResolvedValue(state);
  return {
    withGet: vi.fn().mockReturnValue({ request: mockRequest }),
  } as unknown as Resource<TestCollection>;
}

function createMockPageResource(
  state: State<TestCollection>,
): Resource<TestCollection> {
  return {
    withGet: vi
      .fn()
      .mockReturnValue({ request: vi.fn().mockResolvedValue(state) }),
  } as unknown as Resource<TestCollection>;
}

function createMockPaginatedResource(
  firstPageCollection: State<TestEntity>[],
  secondPageCollection: State<TestEntity>[],
): Resource<TestCollection> {
  const mockNextPageState = createMockResourceState(
    secondPageCollection,
    false,
  );
  const mockNextPageResource = createMockPageResource(mockNextPageState);
  const mockFirstPageState = createMockResourceState(
    firstPageCollection,
    true,
    mockNextPageResource,
  );
  return createMockResource(mockFirstPageState);
}

async function setupHookWithLoading(resource: Resource<TestCollection>) {
  const { result } = renderHook(() => useInfiniteCollection(resource), {
    wrapper,
  });

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });

  return { result };
}

async function loadNextPageAndWait(
  result: RenderHookResult<
    ReturnType<typeof useInfiniteCollection>,
    void
  >['result'],
) {
  await result.current.loadNextPage();

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
}

describe('useInfiniteCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch initial resource and return collection items', async () => {
    const mockCollection = [
      createMockItem('1', 'Item 1'),
      createMockItem('2', 'Item 2'),
    ];
    const mockResourceState = createMockResourceState(mockCollection, false);
    const mockResource = createMockResource(mockResourceState);

    const { result } = renderHook(() => useInfiniteCollection(mockResource), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual(mockCollection);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should return hasNextPage as true when next link exists', async () => {
    const mockCollection = [createMockItem('1', 'Item 1')];
    const mockResourceState = createMockResourceState(
      mockCollection,
      true,
      {} as Resource<TestCollection>,
    );
    const mockResource = createMockResource(mockResourceState);

    const { result } = await setupHookWithLoading(mockResource);

    expect(result.current.hasNextPage).toBe(true);
  });

  it('should load next page and append items', async () => {
    const firstPageCollection = [createMockItem('1', 'Item 1')];
    const secondPageCollection = [createMockItem('2', 'Item 2')];

    const mockResource = createMockPaginatedResource(
      firstPageCollection,
      secondPageCollection,
    );
    const { result } = await setupHookWithLoading(mockResource);

    expect(result.current.items).toEqual(firstPageCollection);

    // Load next page
    await loadNextPageAndWait(result);

    expect(result.current.items).toEqual([
      ...firstPageCollection,
      ...secondPageCollection,
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('should warn and return when loadNextPage is called without next page', async () => {
    const mockCollection = [createMockItem('1', 'Item 1')];
    const mockResourceState = createMockResourceState(mockCollection, false);
    const mockResource = createMockResource(mockResourceState);

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => { /* empty */ });

    const { result } = await setupHookWithLoading(mockResource);

    await result.current.loadNextPage();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'loadNextPage was called, but there was no next page',
    );

    consoleWarnSpy.mockRestore();
  });

  it('should warn and ignore when loadNextPage is called multiple times', async () => {
    const mockCollection = [createMockItem('1', 'Item 1')];
    const emptyCollection: State<TestEntity>[] = [];

    const mockNextPageState = createMockResourceState(emptyCollection, false);
    const mockNextPageResource = createMockPageResource(mockNextPageState);
    const mockResourceState = createMockResourceState(
      mockCollection,
      true,
      mockNextPageResource,
    );
    const mockResource = createMockResource(mockResourceState);

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => { /* empty */ });

    const { result } = await setupHookWithLoading(mockResource);

    // First call
    const firstCall = result.current.loadNextPage();
    // Second call immediately (should be ignored)
    const secondCall = result.current.loadNextPage();

    await firstCall;
    await secondCall;

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'You called loadNextPage(), but it was an old copy. You should not memoize or store a reference to this function, but instead always use the one that was returned last. We ignored this call',
    );

    consoleWarnSpy.mockRestore();
  });

  it('should handle errors during next page loading', async () => {
    const mockCollection = [createMockItem('1', 'Item 1')];
    const mockError = new Error('Network error');

    const mockNextPageResource = {
      withGet: vi
        .fn()
        .mockReturnValue({ request: vi.fn().mockRejectedValue(mockError) }),
    } as unknown as Resource<TestCollection>;

    const mockResourceState = createMockResourceState(
      mockCollection,
      true,
      mockNextPageResource,
    );
    const mockResource = createMockResource(mockResourceState);

    const { result } = await setupHookWithLoading(mockResource);

    // Wrap the async call in act to handle React state updates
    await act(async () => {
      await result.current.loadNextPage();
    });

    // Wait for loading to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Force a rerender to ensure error is reflected
    // The error is stored in a ref, so we need to wait for the next render cycle
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error?.message).toBe('Network error');
  });

  it('should handle errors during initial resource loading', async () => {
    const mockError = new Error('Network error');
    const mockRequest = vi.fn().mockRejectedValue(mockError);
    const mockResource = {
      withGet: vi.fn().mockReturnValue({ request: mockRequest }),
    } as unknown as Resource<TestCollection>;

    const { result } = renderHook(() => useInfiniteCollection(mockResource), {
      wrapper,
    });

    // Wait for loading to complete after error
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // The error should be available from the underlying useReadResource
    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toBe('Network error');
  });

  it('should support multiple page loads in sequence', async () => {
    const firstPageCollection = [createMockItem('1', 'Item 1')];
    const secondPageCollection = [createMockItem('2', 'Item 2')];
    const thirdPageCollection = [createMockItem('3', 'Item 3')];

    const mockThirdPageState = createMockResourceState(
      thirdPageCollection,
      false,
    );
    const mockThirdPageResource = createMockPageResource(mockThirdPageState);
    const mockSecondPageState = createMockResourceState(
      secondPageCollection,
      true,
      mockThirdPageResource,
    );
    const mockSecondPageResource = createMockPageResource(mockSecondPageState);
    const mockFirstPageState = createMockResourceState(
      firstPageCollection,
      true,
      mockSecondPageResource,
    );
    const mockFirstPageResource = createMockResource(mockFirstPageState);

    const { result } = await setupHookWithLoading(mockFirstPageResource);

    expect(result.current.items).toEqual(firstPageCollection);

    // Load second page
    await loadNextPageAndWait(result);

    expect(result.current.items).toEqual([
      ...firstPageCollection,
      ...secondPageCollection,
    ]);

    // Load third page
    await loadNextPageAndWait(result);

    expect(result.current.items).toEqual([
      ...firstPageCollection,
      ...secondPageCollection,
      ...thirdPageCollection,
    ]);

    expect(result.current.hasNextPage).toBe(false);
  });

  it('should preserve existing items when loading next page', async () => {
    const firstPageCollection = [
      createMockItem('1', 'Item 1'),
      createMockItem('2', 'Item 2'),
    ];
    const secondPageCollection = [createMockItem('3', 'Item 3')];

    const mockResource = createMockPaginatedResource(
      firstPageCollection,
      secondPageCollection,
    );
    const { result } = await setupHookWithLoading(mockResource);

    const itemsAfterFirstLoad = [...result.current.items];

    await loadNextPageAndWait(result);

    expect(result.current.items).toEqual([
      ...itemsAfterFirstLoad,
      ...secondPageCollection,
    ]);
  });
});
