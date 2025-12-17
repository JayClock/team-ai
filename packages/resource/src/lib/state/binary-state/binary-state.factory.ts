import { injectable } from 'inversify';
import { State, StateFactory } from '../state.js';
import { Entity } from 'src/lib/archtype/entity.js';
import { ClientInstance } from 'src/lib/client-instance.js';
import { BaseState } from '../base-state.js';
import { parseHeaderLink } from '../../http/util.js';
import { Link } from '../../links/link.js';

@injectable()
export class BinaryStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    currentLink: Link,
    response: Response,
    prevLink?: Link,
  ): Promise<State<TEntity>> {
    return new BaseState({
      client,
      data: await response.blob(),
      headers: response.headers,
      links: parseHeaderLink(client.bookmarkUri, response.headers),
      currentLink,
      prevLink,
    });
  }
}
