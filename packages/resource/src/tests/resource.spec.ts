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
    expect(relation.rels).toEqual(['rel']);
    expect(relation.rootUri).toEqual(resource.uri)
  });

  it('should return a state when invoke get method', async () => {
    const mockBody = {};
    vi.spyOn(mockClient, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockBody))
    );
    const state = await resource.get();
    expect(state.client).toBe(mockClient);
    expect(state.uri).toBe('uri');
    expect(state.data).toEqual(mockBody);
  });
});
