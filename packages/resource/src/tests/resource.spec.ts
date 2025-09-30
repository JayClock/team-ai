import { describe, expect } from 'vitest';
import { Client, Relation, Resource } from '../lib/index.js';

const mockClient = {
  fetch: vi.fn(),
} as unknown as Client;

describe('Resource', () => {
  const resource = new Resource(mockClient, 'uri');

  it('should return new relation when follow', () => {
    const relation = resource.follow('rel');
    expect(relation).toBeInstanceOf(Relation);
    expect(relation.client).toBe(mockClient);
    expect(relation.refs).toEqual(['rel']);
  });

  it('should call client fetch when get relation', async () => {
    await resource.get();
    expect(mockClient.fetch).toHaveBeenCalledWith(resource.uri, undefined);
  });
});
