import { ConversationLegacy, ConversationDescription } from '@web/domain';
import { UserConversationsLegacy } from '../../lib/associations/index.js';
import { expect } from 'vitest';
import { container } from '../../lib/container.js';
import { Factory } from 'inversify';
import { http, HttpResponse } from 'msw';
import { server } from '../setup-tests.js';
import { HalLinks } from '../../lib/archtype/hal-links.js';

describe('UserConversations', () => {
  let userConversations: UserConversationsLegacy;
  let mockUserLinks: HalLinks;

  beforeAll(() => {
    mockUserLinks = {
      conversations: { href: 'http://conversations' },
      'create-conversation': { href: 'http://create-conversation' },
    } as HalLinks;
    const factory = container.get<Factory<UserConversationsLegacy>>(
      'Factory<UserConversationsLegacy>'
    );
    userConversations = factory(mockUserLinks);
  });

  it('should add conversation successfully', async () => {
    const mockResponse = {
      id: '123',
      title: 'Test ConversationLegacy',
      _links: { self: { href: '/api/conversations/123' } },
    };

    server.use(
      http.post(mockUserLinks['create-conversation'].href, () => {
        return HttpResponse.json(mockResponse);
      })
    );

    const description: ConversationDescription = { title: 'Test ConversationLegacy' };
    const result = await userConversations.addConversation(description);
    expect(result.getIdentity()).toBe('123');
    expect(result.getDescription().title).toBe('Test ConversationLegacy');
  });

  it('should find paged conversations successfully', async () => {
    const mockResponse = {
      _embedded: {
        conversations: [
          {
            id: '123',
            title: 'Test ConversationLegacy',
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
    expect(res.items()[0]).toBeInstanceOf(ConversationLegacy);
    expect(res.hasPrev()).toEqual(false);
    expect(res.hasNext()).toEqual(true);
    expect(res.pagination()).toEqual({
      page: 1,
      pageSize: 100,
      total: 200,
    });
  });
});
