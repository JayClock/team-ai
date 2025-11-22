import { describe, expect } from 'vitest';
import { Client, RootResource } from '../lib/index.js';

const mockClient = {
  fetch: vi.fn(),
} as unknown as Client;

describe('RootResource', () => {
  const resource = new RootResource(mockClient, 'uri');

  it('should return a state when invoke get method', async () => {
    const mockBody = {};
    vi.spyOn(mockClient, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockBody))
    );
    const state = await resource.get();
    expect(state.uri).toBe('uri');
    expect(state.data).toEqual(mockBody);
  });
});
