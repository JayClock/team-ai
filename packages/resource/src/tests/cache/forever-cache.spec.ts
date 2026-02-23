import { afterEach, beforeEach, describe, expect } from 'vitest';
import { ForeverCache } from '../../lib/cache/index.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { State } from '../../lib/index.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';

describe('ForeverCache', () => {
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  let cache: ForeverCache;
  let state: State;

  beforeEach(async () => {
    cache = new ForeverCache();
    state = await halStateFactory.create(
      { bookmarkUri: 'https://www.example.com' } as ClientInstance,
      { rel: '', href: '/api/users/1', context: 'https://www.example.com' },
      Response.json({}),
    );
  });

  it('should store and retrieve cloned State objects', () => {
    cache.store(state);
    expect(cache.has('https://www.example.com/api/users/1')).toEqual(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const newState = cache.get('https://www.example.com/api/users/1')!;
    expect(newState).not.eq(state);
    expect(newState.uri).toEqual(state.uri);
    expect(newState.timestamp).toEqual(state.timestamp);
    expect(newState.data).toEqual(state.data);
    expect(newState.collection).toEqual(state.collection);
  });

  it('should allow items to be deleted', () => {
    cache.store(state);
    cache.delete('/api/users/1');
    expect(cache.has('/api/users/1')).toBeFalsy();
    expect(cache.get('/api/users/1')).toEqual(null);
  });

  it('should all items to be cleared', () => {
    cache.store(state);
    cache.clear();
    expect(cache.has('/api/users/1')).toBeFalsy();
  });

  afterEach(() => {
    cache.destroy();
  });
});
