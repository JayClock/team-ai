import {
  ConversationDescription,
  MessageDescription,
} from '../description/index.js';
import { Entity } from '../archtype/index.js';
import { Message } from './message.js';
import { HasManyPaged } from '../archtype/has-many.js';

export class Conversation implements Entity<string, ConversationDescription> {
  constructor(
    private identity: string,
    private description: ConversationDescription,
    private messages: ConversationMessages
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): ConversationDescription {
    return this.description;
  }

  getMessages(): HasManyPaged<Message> {
    return this.messages;
  }

  saveMessage(description: MessageDescription): Promise<Message> {
    return this.messages.saveMessage(description);
  }
  sendMessage(
    message: string
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    return this.messages.sendMessage(message);
  }
}

export interface ConversationMessages extends HasManyPaged<Message> {
  sendMessage(
    message: string
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>>;
}
