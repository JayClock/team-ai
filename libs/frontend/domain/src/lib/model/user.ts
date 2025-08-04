import {
  ConversationDescription,
  UserDescription, UserLinks
} from '../description/index.js';
import { Entity, HalLinksDescription } from '../archtype/index.js';
import { Conversation } from './conversation.js';

export class User implements Entity<string, UserDescription> {
  constructor(
    private identity: string,
    private description: UserDescription & HalLinksDescription,
    private conversations: UserConversations
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): UserDescription {
    return this.description;
  }

  getLinks(): UserLinks {
    return this.description._links as UserLinks;
  }

  addConversation(description: ConversationDescription): Promise<Conversation> {
    return this.conversations.addConversation(description);
  }
}

export interface UserConversations {
  addConversation(description: ConversationDescription): Promise<Conversation>;
}
