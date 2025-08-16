import {
  Conversation,
  ConversationDescription,
  UserConversations as IUserConversations,
} from '@web/domain';
import { api } from '../../api.js';
import { HalLink } from '../archtype/hal-links.js';
import { PagedResponse } from '../archtype/paged-response.js';
import { UserLinks } from '../responses/user-response.js';
import { ConversationResponse } from '../responses/conversation-response.js';

export class UserConversations implements IUserConversations {
  public items: Conversation[] = [];

  constructor(private rootLinks: UserLinks) {}

  async addConversation(
    description: ConversationDescription
  ): Promise<Conversation> {
    const { data } = await api.post<ConversationResponse>(
      this.rootLinks['create-conversation'].href,
      description
    );
    return new Conversation(data.id, {
      title: data.title,
    });
  }

  async fetchData(link: HalLink): Promise<void> {
    const { data } = await api.get<PagedResponse<ConversationResponse>>(
      link.href
    );
    this.items = data._embedded['conversations'].map(
      (conversationResponse) =>
        new Conversation(conversationResponse.id, {
          title: conversationResponse.title,
        })
    );
  }

  fetchFirst() {
    return this.fetchData(this.rootLinks.conversations);
  }
}
