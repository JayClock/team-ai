import { inject, injectable } from 'inversify';
import {
  ConversationMessages as IConversationMessages,
  Many,
  Message,
  MessageDescription,
} from '@web/domain';
import type { HalLinks } from '../archtype/hal-links.js';
import { Axios } from 'axios';
import { MessageResponse } from '../responses/message-response.js';

@injectable()
export class ConversationMessages implements IConversationMessages {
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

  fetchFirst(): Promise<Many<Message>> {
    throw new Error('Method not implemented.');
  }

  items: Message[] = [];
}
