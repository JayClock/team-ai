import { injectable } from 'inversify';
import { Entity } from '../../archtype/entity.js';
import { ClientInstance } from '../../client-instance.js';
import { Links } from '../../links/links.js';
import { Link } from '../../links/link.js';
import { parseHeaderLink } from '../../http/util.js';
import { resolve } from '../../util/uri.js';
import { BaseState } from '../base-state.js';
import { State, StateFactory } from '../state.js';

@injectable()
export class TextStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
  ): Promise<State<TEntity>> {
    const uri = resolve(currentLink);
    const links = parseHeaderLink(uri, response.headers) as unknown as Links<
      TEntity['links']
    >;
    const data = (await response.text()) as TEntity['data'];

    return new BaseState<TEntity>({
      client,
      currentLink,
      data,
      headers: response.headers,
      links,
    });
  }
}
