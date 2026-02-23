import { injectable } from 'inversify';
import { State, StateFactory } from '../state.js';
import { Entity } from 'src/lib/archtype/entity.js';
import { ClientInstance } from 'src/lib/client-instance.js';
import { BaseState } from '../base-state.js';
import { parseHeaderLink } from '../../http/util.js';
import { Link } from '../../links/link.js';
import { resolve } from '../../util/uri.js';

@injectable()
export class StreamStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
  ): Promise<State<TEntity>> {
    return new BaseState({
      client,
      data: response.body,
      headers: response.headers,
      links: parseHeaderLink(resolve(currentLink), response.headers),
      currentLink,
    });
  }
}
