import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResolveResource } from '../../lib/hooks/use-resolve-resource';
import { renderHook, waitFor } from '@testing-library/react';
import { mockClient, wrapper } from './wrapper';
import { Entity, Resource, ResourceRelation } from '@hateoas-ts/resource';

describe('useResolveResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use client.go to create a new resource with string', async () => {
    const mockResource = {} as Resource<Entity>;
    vi.spyOn(mockClient, 'go').mockReturnValue(mockResource);
    const { result } = renderHook(() => useResolveResource('resource'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.resource).toBe(mockResource);
    });

    expect(mockClient.go).toHaveBeenCalledWith('resource');
  });

  it('should return self resource when a Resource is provided', async () => {
    const mockResource = {} as Resource<Entity>;
    const { result } = renderHook(() => useResolveResource(mockResource), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.resource).toBe(mockResource);
    });

    expect(mockClient.go).toHaveBeenCalledTimes(0);
  });

  it('should handle ResourceRelation asynchronously', async () => {
    const mockResource = {} as Resource<Entity>;
    const mockResourceRelation = {
      getResource: vi.fn().mockResolvedValue(mockResource),
    } as unknown as ResourceRelation<Entity>;

    const { result } = renderHook(
      () => useResolveResource(mockResourceRelation),
      {
        wrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.resource).toBe(mockResource);
    });

    expect(mockResourceRelation.getResource).toHaveBeenCalled();
  });
});
