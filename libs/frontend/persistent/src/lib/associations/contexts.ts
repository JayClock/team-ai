import { inject, injectable } from 'inversify';
import { Context, Contexts as IContexts } from '@web/domain';
import { EntityList } from '../archtype/entity-list.js';
import { PagedResponse } from '../archtype/paged-response.js';
import { Axios } from 'axios';

@injectable()
export class Contexts extends EntityList<Context> implements IContexts {
  constructor(@inject(Axios) private axios: Axios) {
    super();
  }

  override async fetchEntities(options: {
    url?: string;
    signal?: AbortSignal;
  }): Promise<PagedResponse<unknown>> {
    const { url = '/api/contexts', signal } = options;
    const { data } = await this.axios.get<
      PagedResponse<{ id: string; title: string; content: string }>
    >(url, {
      signal,
    });
    this._items = data._embedded['contexts'].map(
      (item) =>
        new Context(item.id, {
          title: item.title,
          content: item.content,
        })
    );
    return data;
  }
}
