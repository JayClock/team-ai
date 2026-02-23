import { describe, expect, it, vi } from 'vitest';
import { ClientInstance } from '../../lib/client-instance.js';
import { JsonApiStateFactory } from '../../lib/state/jsonapi-state/jsonapi-state.factory.js';

const mockClient = {
  bookmarkUri: 'https://example.com/',
  go: vi.fn(),
} as unknown as ClientInstance;

describe('JsonApiStateFactory', () => {
  it('should parse top-level links from JSON:API responses', async () => {
    const factory = new JsonApiStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/articles',
        context: 'https://example.com/',
      },
      Response.json({
        links: {
          self: '/articles',
          next: '/articles?page=2',
        },
        data: null,
      }),
    );

    expect(state.getLink('self')).toMatchObject({ href: '/articles' });
    expect(state.getLink('next')).toMatchObject({ href: '/articles?page=2' });
  });

  it('should map collection item self links to item relations', async () => {
    const factory = new JsonApiStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/articles',
        context: 'https://example.com/',
      },
      Response.json({
        data: [
          {
            type: 'article',
            id: '1',
            links: {
              self: '/articles/1',
            },
          },
          {
            type: 'article',
            id: '2',
            links: {
              self: '/articles/2',
            },
          },
        ],
      }),
    );

    const itemLinks = (
      state as unknown as { links: { getMany: (rel: string) => unknown[] } }
    ).links.getMany('item');
    expect(itemLinks).toHaveLength(2);
    expect(itemLinks[0]).toMatchObject({ href: '/articles/1' });
    expect(itemLinks[1]).toMatchObject({ href: '/articles/2' });
  });
});
