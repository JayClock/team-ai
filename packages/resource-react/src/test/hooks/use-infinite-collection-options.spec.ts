import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useReadResource } from '../../lib/hooks/use-read-resource';
import { useInfiniteCollection } from '../../lib/hooks/use-infinite-collection';

vi.mock('../../lib/hooks/use-read-resource', () => ({
  useReadResource: vi.fn(),
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

describe('useInfiniteCollection options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards options to useReadResource', async () => {
    const item = {
      uri: '/api/items/1',
      timestamp: Date.now(),
      data: { id: '1', name: 'Item 1' },
    } as unknown as State<TestEntity>;

    const state = {
      uri: '/api/items',
      timestamp: Date.now(),
      collection: [item],
      hasLink: vi.fn().mockReturnValue(false),
    } as unknown as State<TestCollection>;

    const resource = {
      uri: '/api/items',
    } as Resource<TestCollection>;

    vi.mocked(useReadResource).mockReturnValue({
      loading: false,
      error: null,
      resourceState: state,
      resource,
      setResource: vi.fn(),
    });

    const options = {
      refreshOnStale: true,
      initialGetRequestHeaders: { 'x-test': '1' },
    };

    const { result } = renderHook(() =>
      useInfiniteCollection(resource, options),
    );

    expect(useReadResource).toHaveBeenCalledWith(resource, options);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([item]);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.error).toBe(null);
  });
});
