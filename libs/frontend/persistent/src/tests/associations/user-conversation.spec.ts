import { Conversation, ConversationDescription } from '@web/domain';
import { UserConversations } from '../../lib/associations/index.js';
import { expect } from 'vitest';
import { container } from '../../lib/container.js';
import { Factory } from 'inversify';
import { http, HttpResponse } from 'msw';
import { server } from '../setup-tests.js';
import { HalLinks } from '../../lib/archtype/hal-links.js';

describe('UserConversations', () => {
  let userConversations: UserConversations;
  let mockUserLinks: HalLinks;

  beforeAll(() => {
    mockUserLinks = {
      conversations: { href: 'http://conversations' },
      'create-conversation': { href: 'http://create-conversation' },
    } as HalLinks;
    const factory = container.get<Factory<UserConversations>>(
      'Factory<UserConversations>'
    );
    userConversations = factory(mockUserLinks);
  });

  it('should add conversation successfully', async () => {
    const mockResponse = {
      id: '123',
      title: 'Test Conversation',
      _links: { self: { href: '/api/conversations/123' } },
    };

    server.use(
      http.post(mockUserLinks['create-conversation'].href, () => {
        return HttpResponse.json(mockResponse);
      })
    );

    const description: ConversationDescription = { title: 'Test Conversation' };
    const result = await userConversations.addConversation(description);
    expect(result.getIdentity()).toBe('123');
    expect(result.getDescription().title).toBe('Test Conversation');
  });

  it('should find paged conversations successfully', async () => {
    const mockResponse = {
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
      _links: {
        next: { href: 'next-href' },
      },
    };

    server.use(
      http.get(mockUserLinks.conversations.href, () => {
        return HttpResponse.json(mockResponse);
      })
    );

    const res = await userConversations.findAll();
    expect(res.items().length).toBe(1);
    expect(res.items()[0]).toBeInstanceOf(Conversation);
    expect(res.hasPrev()).toEqual(false);
    expect(res.hasNext()).toEqual(true);
    expect(res.pagination()).toEqual({
      page: 1,
      pageSize: 100,
      total: 200,
    });
  });
});
