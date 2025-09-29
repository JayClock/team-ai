import {
  ConversationLegacy,
  ConversationDescription,
  UserConversationsLegacy as IUserConversations,
} from '@web/domain';
import type { HalLinks } from '../archtype/hal-links.js';
import { ConversationResponse } from '../responses/conversation-response.js';
import { inject, injectable } from 'inversify';
import { Axios } from 'axios';
import { ConversationMessages } from './conversation-messages.js';
import { PagedResponse } from '../archtype/paged-response.js';
import { EntityList } from '../archtype/entity-list.js';

@injectable()
export class UserConversationsLegacy
  extends EntityList<ConversationLegacy>
  implements IUserConversations
{
  constructor(
    private rootLinks: HalLinks,
    @inject(Axios)
    private axios: Axios,
    @inject('Factory<ConversationMessages>')
    private conversationMessagesFactory: (
      links: HalLinks
    ) => ConversationMessages
  ) {
    super();
  }

  async addConversation(
    description: ConversationDescription
  ): Promise<ConversationLegacy> {
    const res = await this.axios.post<ConversationResponse>(
      this.rootLinks['create-conversation'].href,
      description
    );
    return new ConversationLegacy(
      res.data.id,
      {
        title: res.data.title,
      },
      this.conversationMessagesFactory(res.data._links)
    );
  }

  async fetchEntities(options: {
    url?: string;
    signal?: AbortSignal;
  }): Promise<PagedResponse<unknown>> {
    const { url = this.rootLinks['conversations'].href, signal } = options;
    const { data } = await this.axios.get<PagedResponse<ConversationResponse>>(
      url,
      { signal }
    );
    this._items = data._embedded['conversations'].map(
      (conversationResponse) =>
        new ConversationLegacy(
          conversationResponse.id,
          {
            title: conversationResponse.title,
          },
          this.conversationMessagesFactory(conversationResponse._links)
        )
    );
    return data;
  }
}
