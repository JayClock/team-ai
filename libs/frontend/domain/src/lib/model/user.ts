import {
  ConversationDescription,
  UserDescription,
} from '../description/index.js';
import { Entity } from '../archtype/index.js';
import { Conversation } from './conversation.js';
import { HasMany } from '../archtype/has-many.js';

export class User implements Entity<string, UserDescription> {
  constructor(
    private identity: string,
    private description: UserDescription,
    private conversations: UserConversations
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): UserDescription {
    return this.description;
  }

  addConversation(description: ConversationDescription): Promise<Conversation> {
    return this.conversations.addConversation(description);
  }

  getConversations(): HasMany<Conversation> {
    return this.conversations;
  }
}

export interface UserConversations extends HasMany<Conversation> {
  addConversation(description: ConversationDescription): Promise<Conversation>;
}
