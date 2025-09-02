import { describe, expect } from 'vitest';
import { container } from '../../lib/container.js';
import { Contexts } from '../../lib/associations/index.js';
import { server } from '../setup-tests.js';
import { http, HttpResponse } from 'msw';
import { Context } from '@web/domain';

describe('Contexts', () => {
  const contexts = container.get(Contexts);

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
