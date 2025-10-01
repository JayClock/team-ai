import { describe, expect } from 'vitest';
import { Client, Relation } from '../lib/index.js';

const mockClient = {} as Client;
describe('Relation', () => {
  const relation = new Relation(mockClient, 'root uri', ['ref1']);
  it('should return a new relation with updated refs', () => {
    const newRelation = relation.follow('ref2');
    expect(newRelation).not.toBe(relation);
    expect(newRelation.refs).not.toBe(relation.refs);
    expect(newRelation.refs).toEqual(['ref1', 'ref2']);
  });
});
