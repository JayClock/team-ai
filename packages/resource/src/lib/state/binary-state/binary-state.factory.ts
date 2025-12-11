import { injectable } from 'inversify';
import { State, StateFactory } from '../state.js';
import { Entity } from 'src/lib/archtype/entity.js';
import { ClientInstance } from 'src/lib/client-instance.js';
import { BaseState } from '../base-state.js';
import { parseHeaderLink } from '../../http/util.js';

@injectable()
export class BinaryStateFactory implements StateFactory {
  async create<TEntity extends Entity>(
    client: ClientInstance,
    uri: string,
    response: Response
  ): Promise<State<TEntity>> {
    return new BaseState({
      client,
      uri,
      data: await response.blob(),
      headers: response.headers,
      links: parseHeaderLink(client.bookmarkUri, response.headers),
    });
  }
}
