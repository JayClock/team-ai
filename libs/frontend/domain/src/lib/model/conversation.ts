import { ConversationDescription } from '../description/index.js';
import { Entity, HalLinks, HalLinksDescription } from '../archtype/index.js';

export class Conversation implements Entity<string, ConversationDescription> {
  constructor(
    private identity: string,
    private description: ConversationDescription & HalLinksDescription
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): ConversationDescription {
    return this.description;
  }

  getLinks(): HalLinks {
    return this.description._links;
  }
}
