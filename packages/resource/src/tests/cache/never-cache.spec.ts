import { describe, expect } from 'vitest';
import { NeverCache } from '../../lib/cache/intex.js';
import { State } from '../../lib/state/state.js';
import { Entity } from '../../lib/archtype/entity.js';

describe('NeverCache', () => {
  it('should never persist any state', () => {
    const cache = new NeverCache();
    const state = {
      uri: 'https://api.example.com/users/1',
    } as State<Entity>;

    cache.store(state);

    expect(cache.has(state.uri)).toBe(false);
    expect(cache.get(state.uri)).toBe(null);
  });

  it('should no-op for delete and clear', () => {
    const cache = new NeverCache();

    cache.delete('https://api.example.com/users/1');
    cache.clear();

    expect(cache.has('https://api.example.com/users/1')).toBe(false);
  });
});
