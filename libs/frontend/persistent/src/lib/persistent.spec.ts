import { persistent } from './persistent.js';

describe('persistent', () => {
  it('should work', () => {
    expect(persistent()).toEqual('persistent');
  });
});
