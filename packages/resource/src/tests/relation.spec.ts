import { describe, expect, vi } from 'vitest';
import { Client, Relation, Resource, BaseState } from '../lib/index.js';

const mockClient = {
  go: vi.fn(),
} as unknown as Client;
describe('Relation', () => {
  it('should correctly build a chain of relations with the follow() method', () => {
    const root = new Relation(mockClient, 'http://api.com', []);
    const usersRelation = root.follow('users');
    const user1Relation = usersRelation.follow('1');
    expect(usersRelation.rels).toEqual(['users']);
    expect(user1Relation.rels).toEqual(['users', '1']);
    expect(root.rels).toEqual([]);
  });

  it('should follow all relations sequentially to get the final state', async () => {
    const mockFinalState = { data: 'final user data' as unknown as BaseState<any> };
    const mockUser1Resource = {
      get: vi.fn().mockResolvedValue(mockFinalState),
    };
    const mockUsersResource = {
      get: vi.fn().mockResolvedValue({
        follow: vi.fn().mockReturnValue(mockUser1Resource),
      }),
    };
    const mockRootResource = {
      get: vi.fn().mockResolvedValue({
        follow: vi.fn().mockReturnValue(mockUsersResource),
      }),
    } as unknown as Resource<any>;

    vi.spyOn(mockClient, 'go').mockReturnValue(mockRootResource);
    const relation = new Relation(mockClient as Client, 'http://api.com', [
      'users',
      '1',
    ]);
    const finalState = await relation.get();
    expect(finalState).toBe(mockFinalState);
  });
});
