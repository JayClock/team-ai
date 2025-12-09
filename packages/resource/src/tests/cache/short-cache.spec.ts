import { afterEach, beforeEach, describe, expect } from 'vitest';
import { ShortCache } from '../../lib/cache/intex.js';
import { HalState } from '../../lib/state/hal-state.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { HalResource } from 'hal-types';
import { State } from '../../lib/state/state.js';

describe('ShortCache', () => {
  let cache: ShortCache;
  let state: State;

  beforeEach(() => {
    cache = new ShortCache();
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

  it('should automatically expire items after a the timeout has hit', async () => {
    cache = new ShortCache(0);
    cache.store(state);
    await new Promise((res) => setTimeout(res, 10));
    expect(cache.has('/api/users/1')).toBeFalsy();
  });

  afterEach(() => {
    cache.destroy();
  });
});
