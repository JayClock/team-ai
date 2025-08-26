import {
  ConversationDescription,
  MessageDescription,
} from '../description/index.js';
import { Entity, Many } from '../archtype/index.js';
import { Message } from './message.js';

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

  getMessages(): Many<Message> {
    return this.messages;
  }

  saveMessage(description: MessageDescription): Promise<Message> {
    return this.messages.saveMessage(description);
  }
  sendMessage(message: string): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    return this.messages.sendMessage(message);
  }
}

export interface ConversationMessages extends Many<Message> {
  saveMessage(description: MessageDescription): Promise<Message>;
  sendMessage(message: string): Promise<ReadableStream<Uint8Array<ArrayBuffer>>>;
}
