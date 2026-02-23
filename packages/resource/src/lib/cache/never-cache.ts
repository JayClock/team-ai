import { Cache } from './cache.js';
import { State } from '../state/state.js';
import { Entity } from '../archtype/entity.js';
import { injectable } from 'inversify';

/**
 * Cache implementation that stores nothing.
 *
 * Useful when always-fresh reads are preferred over local state reuse.
 */
@injectable()
export class NeverCache implements Cache {
  store(state: State) {
    void state;
  }

  get<T extends Entity>(uri: string): State<T> | null {
    void uri;
    return null;
  }

  has(uri: string): boolean {
    void uri;
    return false;
  }

  delete(uri: string) {
    void uri;
  }

  clear() {
    // no-op
  }

  destroy() {
    // nothing to destroy
  }
}
