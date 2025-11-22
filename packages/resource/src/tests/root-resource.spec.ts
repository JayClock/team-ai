import { describe, expect } from 'vitest';
import { Client, RelationResource, RootResource } from '../lib/index.js';

const mockClient = {
  fetch: vi.fn(),
} as unknown as Client;

describe('RootResource', () => {
  const resource = new RootResource(mockClient, 'uri');

  it('should return new relation when follow', () => {
    const relation = resource.follow('rel');
    expect(relation).toBeInstanceOf(RelationResource);
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
