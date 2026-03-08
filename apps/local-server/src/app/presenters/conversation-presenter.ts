import type {
  ConversationListPayload,
  ConversationPayload,
} from '../schemas/conversation';

function createConversationLinks(conversation: ConversationPayload) {
  return {
    self: {
      href: `/api/conversations/${conversation.id}`,
    },
    project: {
      href: `/api/projects/${conversation.projectId}`,
    },
    collection: {
      href: `/api/projects/${conversation.projectId}/conversations`,
    },
    messages: {
      href: `/api/conversations/${conversation.id}/messages`,
    },
  };
}

export function presentConversation(conversation: ConversationPayload) {
  return {
    _links: createConversationLinks(conversation),
    ...conversation,
  };
}

export function presentConversationList(payload: ConversationListPayload) {
  const { items, page, pageSize, projectId, total } = payload;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  return {
    _links: {
      self: {
        href: `/api/projects/${projectId}/conversations?${query.toString()}`,
      },
      project: {
        href: `/api/projects/${projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      conversations: items.map((conversation) => ({
        _links: createConversationLinks(conversation),
        ...conversation,
      })),
    },
    page,
    pageSize,
    projectId,
    total,
  };
}
