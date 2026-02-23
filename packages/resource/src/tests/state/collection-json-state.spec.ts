import { describe, expect, it, vi } from 'vitest';
import { ClientInstance } from '../../lib/client-instance.js';
import { CollectionJsonStateFactory } from '../../lib/state/collection-json-state/collection-json-state.factory.js';
import type { Collection, Entity } from '../../lib/index.js';

type Book = Entity<{ title: string }>;

const mockClient = {
  bookmarkUri: 'https://example.com/',
  go: vi.fn(),
} as unknown as ClientInstance;

describe('CollectionJsonStateFactory', () => {
  it('should parse collection links and collection items', async () => {
    const factory = new CollectionJsonStateFactory();
    const state = await factory.create<Collection<Book>>(
      mockClient,
      {
        rel: '',
        href: '/books',
        context: 'https://example.com/',
      },
      Response.json({
        collection: {
          href: '/books',
          links: [{ rel: 'self', href: '/books' }],
          items: [
            {
              href: '/books/1',
              data: [{ name: 'title', value: 'Book 1' }],
            },
            {
              href: '/books/2',
              data: [{ name: 'title', value: 'Book 2' }],
            },
          ],
        },
      }),
    );

    expect(state.getLink('self')).toMatchObject({ href: '/books' });
    expect(state.collection).toHaveLength(2);
    expect(state.collection[0]?.isPartial).toBe(true);
    expect(state.collection[0]?.data).toMatchObject({ title: 'Book 1' });
  });

  it('should convert queries and template into actions', async () => {
    const factory = new CollectionJsonStateFactory();
    const state = await factory.create<Collection<Book>>(
      mockClient,
      {
        rel: '',
        href: '/books',
        context: 'https://example.com/',
      },
      Response.json({
        collection: {
          href: '/books',
          queries: [
            {
              rel: 'search',
              href: '/books/search',
              data: [{ name: 'q', value: 'ddd' }],
            },
          ],
          template: {
            data: [{ name: 'title' }],
          },
        },
      }),
    );

    const searchAction = state.action('search' as never);
    const createAction = state.action('create' as never);

    expect(searchAction.method).toBe('GET');
    expect(searchAction.uri).toBe('https://example.com/books/search');
    expect(createAction.method).toBe('POST');
    expect(createAction.uri).toBe('https://example.com/books');
  });
});
