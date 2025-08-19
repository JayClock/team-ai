import { ConversationDescription } from '../description/index.js';
import { Entity, Many } from '../archtype/index.js';
import { Message } from './message.js';

export class Conversation implements Entity<string, ConversationDescription> {
  constructor(
    private identity: string,
    private description: ConversationDescription
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): ConversationDescription {
    return this.description;
  }
}

export interface ConversationMessages extends Many<Message> {
  sendMessage(): Promise<void>;
}
