import { inject, injectable } from 'inversify';
import {
  ConversationMessages as IConversationMessages,
  Message,
} from '@web/domain';
import type { HalLinks } from '../archtype/hal-links.js';
import { Axios } from 'axios';
import { MessageResponse } from '../responses/message-response.js';
import { PagedResponse } from '../archtype/paged-response.js';
import { EntityList } from '../archtype/entity-list.js';

@injectable()
export class ConversationMessages
  extends EntityList<Message>
  implements IConversationMessages
{
  constructor(
    private rootLinks: HalLinks,
    @inject(Axios) protected readonly axios: Axios
  ) {
    super();
  }

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

  override async fetchEntities(options: {
    url?: string;
    signal?: AbortSignal;
  }): Promise<PagedResponse<unknown>> {
    const { url = this.rootLinks['messages'].href, signal } = options;
    const { data } = await this.axios.get<PagedResponse<MessageResponse>>(url, {
      signal,
    });
    this._items = data._embedded['messages'].map(
      (item: MessageResponse) =>
        new Message(item.id, {
          role: item.role,
          content: item.content,
        })
    );
    return data;
  }
}
