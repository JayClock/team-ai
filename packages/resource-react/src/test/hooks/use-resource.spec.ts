import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useReadResource } from '../../lib/hooks/use-read-resource';
import { useResource } from '../../lib/hooks/use-resource';

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
  };
}

describe('useResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the read-resource result and forwards options', () => {
    const state = {
      uri: '/api/users/1',
      timestamp: Date.now(),
      data: { id: '1', name: 'Test User' },
    } as unknown as State<TestEntity>;
    const resource = { uri: '/api/users/1' } as Resource<TestEntity>;
    const setResource = vi.fn();

    vi.mocked(useReadResource).mockReturnValue({
      loading: false,
      error: null,
      resourceState: state,
      resource,
      setResource,
    });

    const options = {
      refreshOnStale: true,
      initialGetRequestHeaders: { Authorization: 'Bearer token' },
    };

    const { result } = renderHook(() => useResource(resource, options));

    expect(useReadResource).toHaveBeenCalledWith(resource, options);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.resourceState).toBe(state);
    expect(result.current.resource).toBe(resource);
    expect(result.current.data).toEqual(state.data);
  });

  it('warns when called with undefined resourceLike', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* empty */
    });

    vi.mocked(useReadResource).mockReturnValue({
      loading: true,
      error: null,
      resourceState: undefined as unknown as State<TestEntity>,
      resource: undefined as unknown as Resource<TestEntity>,
      setResource: vi.fn(),
    });

    renderHook(() =>
      useResource(undefined as unknown as Resource<TestEntity>),
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
