import { describe, it, vi, beforeEach, expect } from 'vitest';
import { useResolveResource } from '../../lib/hooks/use-resolve-resource';
import { renderHook } from '@testing-library/react';
import { mockClient, wrapper } from './wrapper';
import { Entity, Resource } from '@hateoas-ts/resource';

describe('useResolveResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use client.go to create a new resource with string', () => {
    const mockResource = {} as Resource<Entity>;
    vi.spyOn(mockClient, 'go').mockReturnValue(mockResource);
    const { result } = renderHook(() => useResolveResource('resource'), {
      wrapper,
    });

    expect(mockClient.go).toHaveBeenCalledWith('resource');
    expect(result.current.resource).toBe(mockResource);
    expect(result.current.setResource).toBeInstanceOf(Function);
  });

  it('should use return self resource', () => {
    const mockResource = {} as Resource<Entity>;
    const { result } = renderHook(() => useResolveResource(mockResource), {
      wrapper,
    });

    expect(mockClient.go).toHaveBeenCalledTimes(0)
    expect(result.current.resource).toBe(mockResource);
    expect(result.current.setResource).toBeInstanceOf(Function);
  });
});
