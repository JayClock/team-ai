import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReadResource } from '../../lib/hooks/use-read-resource';
import { renderHook, waitFor } from '@testing-library/react';
import { wrapper } from './wrapper';
import { Entity, Resource, State } from '@hateoas-ts/resource';

interface TestEntity extends Entity {
  data: {
    id: string;
    name: string;
  };
  links: {
    self: TestEntity;
  };
}

describe('useReadResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not fetch when resource is null', () => {
    const { result } = renderHook(() => useReadResource(null as any), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);
    expect(result.current.resource).toBe(null);
  });

  it('should fetch resource state and update loading status', async () => {
    const mockState = {
      data: { id: '1', name: 'Test' },
      timestamp: Date.now(),
      uri: '/api/test',
    } as State<TestEntity>;

    const mockRequest = vi.fn().mockResolvedValue(mockState);
    const mockResource = {
      withGet: vi.fn().mockReturnValue({ request: mockRequest }),
    } as unknown as Resource<TestEntity>;

    const { result } = renderHook(() => useReadResource(mockResource), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockResource.withGet).toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalled();
    expect(result.current.resourceState).toBe(mockState);
    expect(result.current.error).toBe(null);
  });

  it('should handle errors during resource fetching', async () => {
    const mockError = new Error('Network error');
    const mockRequest = vi.fn().mockRejectedValue(mockError);
    const mockResource = {
      withGet: vi.fn().mockReturnValue({ request: mockRequest }),
    } as unknown as Resource<TestEntity>;

    const { result } = renderHook(() => useReadResource(mockResource), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockResource.withGet).toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalled();
    expect(result.current.error).toBe(mockError);
  });
});
