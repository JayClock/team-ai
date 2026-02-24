import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Entity, Resource, State } from '@hateoas-ts/resource';
import { useSuspenseReadResource } from '../../lib/hooks/use-suspense-read-resource';
import { wrapper } from './wrapper';

interface TestEntity extends Entity {
  data: {
    id: string;
    name: string;
  };
  links: {
    self: TestEntity;
  };
}

describe('useSuspenseReadResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initialState directly when uri matches and skips get()', () => {
    const state = {
      uri: '/api/users/1',
      timestamp: Date.now(),
      data: { id: '1', name: 'Suspense User' },
      clone: vi.fn(),
    } as unknown as State<TestEntity>;

    const resource = {
      uri: '/api/users/1',
      get: vi.fn(),
      refresh: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as Resource<TestEntity>;

    const { result } = renderHook(
      () =>
        useSuspenseReadResource(resource, {
          initialState: state,
        }),
      { wrapper },
    );

    expect(result.current.resource).toBe(resource);
    expect(result.current.resourceState).toBe(state);
    expect(resource.get).not.toHaveBeenCalled();
  });
});
