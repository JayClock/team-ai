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

  it('should return a state when invoke post method', async () => {
    const mockBody = { id: '1', name: 'Test' };
    const postData = { title: 'New Item' };

    vi.spyOn(mockClient, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockBody))
    );

    const state = await resource.post(postData);

    expect(mockClient.fetch).toHaveBeenCalledWith('uri', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });
    expect(state.uri).toBe('uri');
    expect(state.data).toEqual(mockBody);
  });
});
