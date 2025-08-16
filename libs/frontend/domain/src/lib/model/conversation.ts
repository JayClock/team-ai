import { ConversationDescription } from '../description/index.js';
import { Entity } from '../archtype/index.js';

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
