import { inject, injectable } from 'inversify';
import {
  ConversationMessages as IConversationMessages,
  Many,
  Message,
} from '@web/domain';
import type { HalLinks } from '../archtype/hal-links.js';
import { Axios } from 'axios';
import { MessageResponse } from '../responses/message-response.js';
import { PagedResponse } from '../archtype/paged-response.js';

@injectable()
export class ConversationMessages implements IConversationMessages {
  constructor(
    private rootLinks: HalLinks,
    @inject(Axios) protected readonly axios: Axios
  ) {}

  async sendMessage(
    message: string
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const link = this.rootLinks['send-message'];
    const response = await fetch(link.href, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'user', content: message }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Response body is null');
    }
    return response.body;
  }

  async findAll(options?: { signal?: AbortSignal }): Promise<Many<Message>> {
    return this.fetchAndMap({ signal: options?.signal });
  }

  private async fetchAndMap(options: {
    url?: string;
    signal?: AbortSignal;
  }): Promise<Many<Message>> {
    const { url = this.rootLinks['messages'].href, signal } = options;
    const { data } = await this.axios.get<PagedResponse<MessageResponse>>(url, {
      signal,
    });
    return {
      items: () => {
        return data._embedded['messages'].map(
          (item: MessageResponse) =>
            new Message(item.id, {
              role: item.role,
              content: item.content,
            })
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
