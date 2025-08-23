import { inject, injectable } from 'inversify';
import {
  ConversationMessages as IConversationMessages,
  Message,
  MessageDescription,
} from '@web/domain';
import type { HalLinks } from '../archtype/hal-links.js';
import { Axios } from 'axios';
import { MessageResponse } from '../responses/message-response.js';
import { PagedResponse, PageLinks } from '../archtype/paged-response.js';

@injectable()
export class ConversationMessages implements IConversationMessages {
  #items: Message[] = [];
  #links: PageLinks | null = null;
  items = () => this.#items;

  constructor(
    private rootLinks: HalLinks,
    @inject(Axios) private axios: Axios
  ) {}

  async saveMessage(description: MessageDescription): Promise<Message> {
    const link = this.rootLinks['save-message'];
    const { data } = await this.axios.request<MessageResponse>({
      url: link.href,
      method: link.type,
      data: description,
    });
    return new Message(data.id, {
      role: data.role,
      content: data.content,
    });
  }

  hasPrev(): boolean {
    return !!this.#links?.prev;
  }

  hasNext(): boolean {
    return !!this.#links?.next;
  }

  async fetchFirst(): Promise<void> {
    const link = this.rootLinks['messages'];
    const { data } = await this.axios.request<PagedResponse<MessageResponse>>({
      url: link.href,
      method: link.type,
    });
    this.#items = data._embedded.messsages.map(
      (item: MessageResponse) =>
        new Message(item.id, {
          role: item.role,
          content: item.content,
        })
    );
  }
}
