import { describe, expect, it, vi } from 'vitest';
import { ClientInstance } from '../../lib/client-instance.js';
import { HtmlStateFactory } from '../../lib/state/html-state/html-state.factory.js';

const mockClient = {
  bookmarkUri: 'https://example.com/',
  go: vi.fn(),
} as unknown as ClientInstance;

describe('HtmlStateFactory', () => {
  it('should parse html links from body and Link header', async () => {
    const factory = new HtmlStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/docs',
        context: 'https://example.com/',
      },
      new Response(
        `
          <html>
            <head>
              <link rel="stylesheet" href="/assets/site.css" />
            </head>
            <body>
              <a rel="next" href="/docs/2">next</a>
            </body>
          </html>
        `,
        {
          headers: {
            'Content-Type': 'text/html',
            Link: '</docs/3>; rel="last"',
          },
        },
      ),
    );

    expect(state.hasLink('next')).toBe(true);
    expect(state.hasLink('last')).toBe(true);
    expect(state.getLink('stylesheet')).toMatchObject({
      href: '/assets/site.css',
    });
  });

  it('should map html forms to actions', async () => {
    const factory = new HtmlStateFactory();
    const state = await factory.create(
      mockClient,
      {
        rel: '',
        href: '/docs',
        context: 'https://example.com/',
      },
      new Response(
        `
          <html>
            <body>
              <form id="search" action="/search" method="post" enctype="application/json"></form>
            </body>
          </html>
        `,
        {
          headers: {
            'Content-Type': 'text/html',
          },
        },
      ),
    );

    const action = state.action('search' as never);
    expect(action.uri).toBe('https://example.com/search');
    expect(action.method).toBe('POST');
    expect(action.contentType).toBe('application/json');
  });
});
