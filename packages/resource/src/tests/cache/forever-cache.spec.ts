import { afterEach, beforeEach, describe, expect } from 'vitest';
import { ForeverCache } from '../../lib/cache/intex.js';
import { HalState } from '../../lib/state/hal-state.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { HalResource } from 'hal-types';
import { State } from '../../lib/state/state.js';

describe('ForeverCache', () => {
  let cache: ForeverCache;
  let state: State;

  beforeEach(() => {
    cache = new ForeverCache();
    state = HalState.create(
      {} as ClientInstance,
      '/api/users/1',
      {} as HalResource
    );
  });

  it('should store and retrieve cloned State objects', () => {
    cache.store(state);
    expect(cache.has('/api/users/1')).toEqual(true);
    const ts = Date.now();
    // We're resetting the timestamps so they do not drift during
    // cloning
    state.timestamp = ts;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const newState = cache.get('/api/users/1')!;
    newState.timestamp = ts;
    expect(newState).not.eq(state);
    expect(newState).toEqual(state);
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
