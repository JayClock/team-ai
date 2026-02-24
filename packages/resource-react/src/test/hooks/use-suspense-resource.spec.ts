import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useSuspenseReadResource } from '../../lib/hooks/use-suspense-read-resource';
import { useSuspenseResource } from '../../lib/hooks/use-suspense-resource';

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
  };
}

describe('useSuspenseResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps suspense-read result and forwards options', () => {
    const state = {
      uri: '/api/users/1',
      timestamp: Date.now(),
      data: { id: '1', name: 'Suspense User' },
    } as unknown as State<TestEntity>;
    const resource = { uri: '/api/users/1' } as Resource<TestEntity>;

    vi.mocked(useSuspenseReadResource).mockReturnValue({
      resourceState: state,
      resource,
    });

    const options = {
      refreshOnStale: true,
      initialGetRequestHeaders: { Authorization: 'Bearer token' },
    };

    const { result } = renderHook(() => useSuspenseResource(resource, options));

    expect(useSuspenseReadResource).toHaveBeenCalledWith(resource, options);
    expect(result.current.resourceState).toBe(state);
    expect(result.current.resource).toBe(resource);
    expect(result.current.data).toEqual(state.data);
  });
});
