import { describe, expect, vi } from 'vitest';
import { BaseState, Client, Relation, Resource } from '../lib/index.js';
import { Account, Conversation, User } from './fixtures/interface.js';
import halUser from './fixtures/hal-user.json' with { type: 'json' };
import halConversations from './fixtures/hal-conversations.json' with { type: 'json' };
import { HalStateFactory } from '../lib/state/hal.js';
import { HalResource } from 'hal-types';

const mockClient = {
  root: vi.fn()
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

  describe('get method with HAL resources', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should get embedded array resource (accounts)', async () => {
      const userState = HalStateFactory<User>(
        mockClient as Client,
        '/api/users/1',
        halUser as HalResource
      );

      const mockRootResource = {
        get: vi.fn().mockResolvedValue(userState)
      } as unknown as Resource<User>;

      vi.spyOn(mockClient, 'root').mockReturnValue(mockRootResource);

      const accountsRelation = new Relation(mockClient as Client, '/api/users/1', [
        'accounts'
      ]);

      const accountsState = await accountsRelation.get();

      expect(accountsState.collection).toHaveLength(2);
      expect(accountsState.uri).toBe('/api/users/1/accounts');

      const firstAccount = accountsState.collection[0] as BaseState<Account>;
      expect(firstAccount.data.id).toBe('1');
      expect(firstAccount.data.provider).toBe('github');
      expect(firstAccount.data.providerId).toBe('35857909');

      const secondAccount = accountsState.collection[1] as BaseState<Account>;
      expect(secondAccount.data.id).toBe('2');
      expect(secondAccount.data.provider).toBe('google');
      expect(secondAccount.data.providerId).toBe('55877909');
    });

    it('should get embedded single resource (latest-conversation)', async () => {
      const userState = HalStateFactory<User>(
        mockClient as Client,
        '/api/users/1',
        halUser as HalResource
      );

      const mockRootResource = {
        get: vi.fn().mockResolvedValue(userState)
      } as unknown as Resource<User>;

      vi.spyOn(mockClient, 'root').mockReturnValue(mockRootResource);

      const latestConversationRelation = new Relation(
        mockClient as Client,
        '/api/users/1',
        ['latest-conversation']
      );

      const conversationState = await latestConversationRelation.get();

      expect(conversationState.data.id).toBe('conv-456');
      expect(conversationState.data.title).toBe('Recent chat about HATEOAS');
      expect(conversationState.uri).toBe('/api/conversations/conv-456');
    });

    it('should get resource through link following (conversations)', async () => {
      const userState = HalStateFactory<User>(
        mockClient as Client,
        '/api/users/1',
        halUser as HalResource
      );

      const conversationsState = HalStateFactory<User>(
        mockClient as Client,
        '/api/users/1/conversations',
        halConversations,
        'conversations'
      );

      const mockConversationsResource = {
        get: vi.fn().mockResolvedValue(conversationsState)
      } as unknown as Resource<User>;

      const mockUserResource = {
        ...userState,
        get: vi.fn().mockResolvedValue(userState),
        follow: vi.fn().mockReturnValue(mockConversationsResource),
        getEmbedded: vi.fn().mockReturnValue(undefined)
      } as unknown as BaseState<User>;

      const mockRootResource = {
        get: vi.fn().mockResolvedValue(mockUserResource)
      } as unknown as Resource<User>;

      vi.spyOn(mockClient, 'root').mockImplementation((uri: string) => {
        if (uri === userState.uri) {
          return mockRootResource;
        }
        if (uri === conversationsState.uri) {
          return mockConversationsResource;
        }
        throw new Error();
      });

      const conversationsRelation = new Relation(
        mockClient as Client,
        '/api/users/1',
        ['conversations']
      );

      const resultState = await conversationsRelation.get();

      expect(resultState.collection).toHaveLength(40);
      expect(resultState.uri).toBe('/api/users/1/conversations');

      const firstConversation = resultState.collection[0] as BaseState<Conversation>;
      expect(firstConversation.data.id).toBe('1');
      expect(firstConversation.data.title).toBe('Conversation Item 1');

    });
  });
});
