import type { MessageListPayload, MessagePayload } from '../schemas/message';

function createMessageLinks(message: MessagePayload) {
  return {
    self: {
      href: `/api/messages/${message.id}`,
    },
    conversation: {
      href: `/api/conversations/${message.conversationId}`,
    },
    collection: {
      href: `/api/conversations/${message.conversationId}/messages`,
    },
    retry: {
      href: `/api/messages/${message.id}/retry`,
    },
  };
}

export function presentMessage(message: MessagePayload) {
  return {
    _links: createMessageLinks(message),
    ...message,
  };
}

export function presentMessageList(payload: MessageListPayload) {
  const { conversationId, items, page, pageSize, total } = payload;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  return {
    _links: {
      self: {
        href: `/api/conversations/${conversationId}/messages?${query.toString()}`,
      },
      conversation: {
        href: `/api/conversations/${conversationId}`,
      },
      stream: {
        href: `/api/conversations/${conversationId}/stream`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      messages: items.map((message) => ({
        _links: createMessageLinks(message),
        ...message,
      })),
    },
    conversationId,
    page,
    pageSize,
    total,
  };
}
