import {
  Conversation,
  ConversationDescription,
  HalLink,
  HalLinksDescription,
  PagedResponse,
  UserConversations as IUserConversations,
  UserLinks,
} from '@web/domain';
import { api } from '../../api.js';

interface ConversationResponse extends HalLinksDescription {
  id: string;
  title: string;
}

export class UserConversations implements IUserConversations {
  public items: Conversation[] = [];

  constructor(private userLinks: UserLinks) {}

  async addConversation(
    description: ConversationDescription
  ): Promise<Conversation> {
    const { data } = await api.post<ConversationResponse>(
      this.userLinks['create-conversation'].href,
      description
    );
    return new Conversation(data.id, {
      title: data.title,
      _links: data._links,
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
          _links: conversationResponse._links,
        })
    );
  }

  fetchFirst() {
    return this.fetchData(this.userLinks.conversations);
  }
}
