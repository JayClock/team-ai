import 'reflect-metadata';
import {
  Conversation,
  ConversationDescription,
  UserConversations as IUserConversations,
  Many,
} from '@web/domain';
import type { HalLinks } from '../archtype/hal-links.js';
import { ConversationResponse } from '../responses/conversation-response.js';
import { inject, injectable } from 'inversify';
import { Axios } from 'axios';
import { ConversationMessages } from './conversation-messages.js';
import { PagedResponse } from '../archtype/paged-response.js';

@injectable()
export class UserConversations implements IUserConversations {
  constructor(
    private rootLinks: HalLinks,
    @inject(Axios)
    protected readonly axios: Axios, // Changed from private to protected
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

  async findAll(options?: {
    signal?: AbortSignal;
  }): Promise<Many<Conversation>> {
    const link = this.rootLinks['conversations'];
    return this.fetchAndMap({ url: `${link.href}`, signal: options?.signal });
  }

  private async fetchAndMap(options: {
    url: string;
    signal?: AbortSignal;
  }): Promise<Many<Conversation>> {
    const { url, signal } = options;

    const { data } = await this.axios.get<PagedResponse<ConversationResponse>>(
      url,
      { signal }
    );
    return {
      items: () => {
        return data._embedded['conversations'].map(
          (conversationResponse) =>
            new Conversation(
              conversationResponse.id,
              {
                title: conversationResponse.title,
              },
              this.conversationMessagesFactory(conversationResponse._links)
            )
        );
      },
      hasPrev: () => !!data._links.prev,
      hasNext: () => !!data._links.next,
      fetchPrev: (options) =>
        this.fetchAndMap({
          url: data._links.prev.href,
          signal: options?.signal,
        }),
      fetchNext: (options) =>
        this.fetchAndMap({
          url: data._links.next.href,
          signal: options?.signal,
        }),
      pagination: () => ({
        page: data.page.number,
        pageSize: data.page.size,
        total: data.page.totalElements,
      }),
    };
  }
}
