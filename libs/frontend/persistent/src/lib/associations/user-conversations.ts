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
import { EntityList } from '../archtype/entity-list.js';

@injectable()
export class UserConversations
  extends EntityList<Conversation>
  implements IUserConversations
{
  constructor(
    private rootLinks: HalLinks,
    @inject(Axios)
    private readonly axios: Axios,
    @inject('Factory<ConversationMessages>')
    private conversationMessagesFactory: (
      links: HalLinks
    ) => ConversationMessages
  ) {
    super();
  }

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

  async fetchData(link: HalLink): Promise<void> {
    const { data } = await this.axios.get<PagedResponse<ConversationResponse>>(
      link.href
    );
    this._items = data._embedded['conversations'].map(
      (conversationResponse) =>
        new Conversation(
          conversationResponse.id,
          {
            title: conversationResponse.title,
          },
          this.conversationMessagesFactory(conversationResponse._links)
        )
    );
    this._pagination = {
      page: data.page.number,
      pageSize: data.page.size,
      total: data.page.totalElements,
    };
    this._pageLinks = data._links;
  }

  async fetchFirst(): Promise<void> {
    await this.fetchData(this.rootLinks['conversations']);
  }
}
