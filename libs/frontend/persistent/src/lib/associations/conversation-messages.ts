import { inject, injectable } from 'inversify';
import {
  ConversationMessages as IConversationMessages,
  Message,
  MessageDescription,
} from '@web/domain';
import type { HalLink, HalLinks } from '../archtype/hal-links.js';
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
    @inject(Axios) private axios: Axios
  ) {
    super();
  }

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

  async fetchData(link: HalLink): Promise<void> {
    const { data } = await this.axios.request<PagedResponse<MessageResponse>>({
      url: link.href,
      method: link.type,
    });
    this._items = data._embedded['messages'].map(
      (item: MessageResponse) =>
        new Message(item.id, {
          role: item.role,
          content: item.content,
        })
    );
    this._pagination = {
      page: data.page.number,
      pageSize: data.page.size,
      total: data.page.totalElements,
    };
    this._pageLinks = data._links;
  }

  async fetchFirst(): Promise<void> {
    await this.fetchData(this.rootLinks['messages']);
  }
}
