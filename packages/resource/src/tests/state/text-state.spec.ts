import { describe, expect, it, vi } from 'vitest';
import { ClientInstance } from '../../lib/client-instance.js';
import { TextStateFactory } from '../../lib/state/text-state/text-state.factory.js';

const mockClient = {
  bookmarkUri: 'https://example.com/',
  go: vi.fn(),
} as unknown as ClientInstance;

describe('TextStateFactory', () => {
  it('should parse text response body as state data', async () => {
    const factory = new TextStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/notes/1',
        context: 'https://example.com/',
      },
      new Response('hello world', {
        headers: {
          'Content-Type': 'text/plain',
        },
      }),
    );

    expect(state.uri).toBe('https://example.com/notes/1');
    expect(state.data).toBe('hello world');
  });

  it('should parse links from HTTP Link headers', async () => {
    const factory = new TextStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/notes/1',
        context: 'https://example.com/',
      },
      new Response('hello', {
        headers: {
          'Content-Type': 'text/plain',
          Link: '</notes/2>; rel="next"',
        },
      }),
    );

    expect(state.hasLink('next')).toBe(true);
    expect(state.getLink('next')).toMatchObject({
      href: '/notes/2',
      context: 'https://example.com/notes/1',
    });
  });
});
