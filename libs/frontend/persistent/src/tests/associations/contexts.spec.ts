import { describe, expect } from 'vitest';
import { container } from '../../lib/container.js';
import { server } from '../setup-tests.js';
import { http, HttpResponse } from 'msw';
import { Context, ENTRANCES } from '@web/domain';
import { Contexts } from '../../lib/associations/index.js';

describe('Contexts', () => {
  const contexts: Contexts = container.get(ENTRANCES.CONTEXTS);

  it('should find contexts successfully', async () => {
    const url = 'http://contexts';
    server.use(
      http.get(url, () => {
        return HttpResponse.json({
          _embedded: {
            contexts: [
              {
                id: '1',
                title: 'title',
                content: 'content',
              },
            ],
          },
        });
      })
    );
    const res = await contexts.findAll({ url });
    expect(res.items().length).toEqual(1);
    expect(res.pagination()).toBeNull();
    expect(res.items()[0]).toBeInstanceOf(Context);
  });
});
