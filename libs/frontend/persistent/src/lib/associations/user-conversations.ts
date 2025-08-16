import {
  Conversation,
  ConversationDescription,
  UserConversations as IUserConversations,
} from '@web/domain';
import { HalLink } from '../archtype/hal-links.js';
import { PagedResponse } from '../archtype/paged-response.js';
import { ConversationResponse } from '../responses/conversation-response.js';
import type { UserLinks } from '../responses/user-response.js';
import { inject, injectable } from 'inversify';
import { Axios } from 'axios';

@injectable()
export class UserConversations implements IUserConversations {
  public items: Conversation[] = [];

  constructor(
    private rootLinks: UserLinks,
    @inject(Axios)
    private readonly axios: Axios
  ) {}

  async addConversation(
    description: ConversationDescription
  ): Promise<Conversation> {
    const { data } = await this.axios.post<ConversationResponse>(
      this.rootLinks['create-conversation'].href,
      description
    );
    return new Conversation(data.id, {
      title: data.title,
    });
  }

  async fetchData(link: HalLink): Promise<void> {
    const { data } = await this.axios.get<PagedResponse<ConversationResponse>>(
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
