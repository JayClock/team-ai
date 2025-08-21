import 'reflect-metadata';
import {
  Conversation,
  ConversationDescription,
  UserConversations as IUserConversations,
} from '@web/domain';
import type { HalLink, HalLinks } from '../archtype/hal-links.js';
import { PagedResponse } from '../archtype/paged-response.js';
import { ConversationResponse } from '../responses/conversation-response.js';
import { inject, injectable } from 'inversify';
import { Axios } from 'axios';
import { ConversationMessages } from './conversation-messages.js';

@injectable()
export class UserConversations implements IUserConversations {
  #items: Conversation[] = [];
  public items = () => this.#items;
  private embeddedKey = 'conversations';

  constructor(
    private rootLinks: HalLinks,
    @inject(Axios)
    private readonly axios: Axios,
    @inject('Factory<ConversationMessages>')
    private conversationMessagesFactory: (
      links: HalLinks
    ) => ConversationMessages
  ) {}

  async addConversation(
    description: ConversationDescription
  ): Promise<Conversation> {
    const { data } = await this.axios.post<ConversationResponse>(
      this.rootLinks['create-conversation'].href,
      description
    );
    return new Conversation(
      data.id,
      {
        title: data.title,
      },
      this.conversationMessagesFactory(data._links)
    );
  }

  async fetchData(link: HalLink): Promise<UserConversations> {
    const { data } = await this.axios.get<PagedResponse<ConversationResponse>>(
      link.href
    );
    this.#items = data._embedded[this.embeddedKey].map(
      (conversationResponse) =>
        new Conversation(
          conversationResponse.id,
          {
            title: conversationResponse.title,
          },
          this.conversationMessagesFactory(conversationResponse._links)
        )
    );
    return this;
  }

  fetchFirst(): Promise<UserConversations> {
    return this.fetchData(this.rootLinks[this.embeddedKey]);
  }
}
