import { afterEach, beforeEach, describe, expect } from 'vitest';
import { ShortCache } from '../../lib/cache/intex.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { State } from '../../lib/index.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';

describe('ShortCache', () => {
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  let cache: ShortCache;
  let state: State;

  beforeEach(async () => {
    cache = new ShortCache();
    state = await halStateFactory.create(
      { bookmarkUri: 'https://www.example.com' } as ClientInstance,
      '/api/users/1',
      Response.json({}),
    );
  });

  it('should store and retrieve cloned State objects', () => {
    cache.store(state);
    expect(cache.has("https://www.example.com/api/users/1")).toEqual(true);
    const ts = Date.now();
    // We're resetting the timestamps so they do not drift during
    // cloning
    state.timestamp = ts;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const newState = cache.get('https://www.example.com/api/users/1')!;
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
