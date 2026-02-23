import { describe, expect, it, vi } from 'vitest';
import { ClientInstance } from '../../lib/client-instance.js';
import { SirenStateFactory } from '../../lib/state/siren-state/siren-state.factory.js';

const mockClient = {
  bookmarkUri: 'https://example.com/',
  go: vi.fn(),
} as unknown as ClientInstance;

describe('SirenStateFactory', () => {
  it('should parse siren links and embedded entity links', async () => {
    const factory = new SirenStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/orders/42',
        context: 'https://example.com/',
      },
      Response.json({
        properties: { id: 42 },
        links: [{ rel: ['self'], href: '/orders/42' }],
        entities: [
          {
            rel: ['item'],
            links: [{ rel: ['self'], href: '/orders/42/items/1' }],
            properties: { sku: 'ABC' },
          },
        ],
      }),
    );

    expect(state.getLink('self')).toMatchObject({ href: '/orders/42' });
    expect(state.getLink('item')).toMatchObject({ href: '/orders/42/items/1' });
  });

  it('should parse siren actions as executable forms', async () => {
    const factory = new SirenStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/orders/42',
        context: 'https://example.com/',
      },
      Response.json({
        properties: { id: 42 },
        actions: [
          {
            name: 'update-order',
            method: 'PUT',
            href: '/orders/42',
            type: 'application/json',
            fields: [{ name: 'status', type: 'text' }],
          },
        ],
      }),
    );

    const action = state.action('update-order' as never);
    expect(action.uri).toBe('https://example.com/orders/42');
    expect(action.method).toBe('PUT');
    expect(action.contentType).toBe('application/json');
    expect(action.field('status')).toBeDefined();
  });
});
