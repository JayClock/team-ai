import { Conversation, ConversationDescription, UserLinks } from '@web/domain';
import { UserConversations } from '../../lib/associations/index.js';
import { api } from '../../api.js';
import { expect } from 'vitest';

vi.mock('../../api.js', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('UserConversations', () => {
  let userConversations: UserConversations;
  let mockUserLinks: UserLinks;

  beforeEach(() => {
    mockUserLinks = {
      conversations: { href: '/api/users/1/conversations' },
      'create-conversation': { href: '/api/users/1/conversations' },
    } as UserLinks;
    userConversations = new UserConversations(mockUserLinks);
    vi.clearAllMocks();
  });

  it('should add conversation successfully', async () => {
    const mockResponse = {
      data: {
        id: '123',
        title: 'Test Conversation',
        _links: { self: { href: '/api/conversations/123' } },
      },
    };
    vi.mocked(api.post).mockResolvedValue(mockResponse);

    const description: ConversationDescription = { title: 'Test Conversation' };
    const result = await userConversations.addConversation(description);

    expect(api.post).toHaveBeenCalledWith(
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
      },
    };
    vi.mocked(api.get).mockResolvedValue(mockResponse);
    await userConversations.fetchFirst();
    expect(userConversations.items.length).toBe(1);
    expect(userConversations.items[0]).toBeInstanceOf(Conversation);
  });
});
