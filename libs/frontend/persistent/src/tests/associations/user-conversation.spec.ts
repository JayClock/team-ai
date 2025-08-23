import { Conversation, ConversationDescription } from '@web/domain';
import { UserConversations } from '../../lib/associations/index.js';
import { expect, Mocked } from 'vitest';
import { UserLinks } from '../../lib/responses/user-response.js';
import { container } from '../../lib/container.js';
import { Axios } from 'axios';
import { Factory } from 'inversify';

describe('UserConversations', () => {
  let userConversations: UserConversations;
  let mockUserLinks: UserLinks;
  const mockAxios = {
    post: vi.fn(),
    get: vi.fn(),
  } as unknown as Mocked<Axios>;

  beforeEach(() => {
    mockUserLinks = {
      conversations: { href: '/api/users/1/conversations' },
      'create-conversation': { href: '/api/users/1/conversations' },
    } as UserLinks;
    container.rebindSync(Axios).toConstantValue(mockAxios);
    const factory = container.get<Factory<UserConversations>>(
      'Factory<UserConversations>'
    );
    userConversations = factory(mockUserLinks);
  });

  it('should add conversation successfully', async () => {
    const mockResponse = {
      data: {
        id: '123',
        title: 'Test Conversation',
        _links: { self: { href: '/api/conversations/123' } },
      },
    };
    vi.mocked(mockAxios.post).mockResolvedValue(mockResponse);

    const description: ConversationDescription = { title: 'Test Conversation' };
    const result = await userConversations.addConversation(description);

    expect(mockAxios.post).toHaveBeenCalledWith(
      '/api/users/1/conversations',
      description
    );
    expect(result.getIdentity()).toBe('123');
    expect(result.getDescription().title).toBe('Test Conversation');
  });

  it('should fetch first page of conversations successfully', async () => {
    const mockResponse = {
      data: {
        _embedded: {
          conversations: [
            {
              id: '123',
              title: 'Test Conversation',
              _links: { self: { href: '/api/conversations/123' } },
            },
          ],
        },
        page: {
          number: 1,
          size: 100,
          totalElements: 200,
          totalPages: 2,
        },
      },
    };
    vi.mocked(mockAxios.get).mockResolvedValue(mockResponse);
    await userConversations.fetchFirst();
    expect(userConversations.items().length).toBe(1);
    expect(userConversations.items()[0]).toBeInstanceOf(Conversation);
    expect(userConversations.hasPrev()).toEqual(false);
    expect(userConversations.hasNext()).toEqual(false);
    expect(userConversations.pagination()).toEqual({
      page: 1,
      pageSize: 100,
      total: 200,
    });
  });
});
