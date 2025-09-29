import {
  ConversationDescription,
  UserDescription,
} from '../description/index.js';
import { Entity } from '../archtype/index.js';
import { ConversationLegacy } from './conversation-legacy.js';
import { HasMany } from '../archtype/has-many.js';

export class UserLegacy implements Entity<string, UserDescription> {
  constructor(
    private identity: string,
    private description: UserDescription,
    private conversations: UserConversationsLegacy
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): UserDescription {
    return this.description;
  }

  addConversation(description: ConversationDescription): Promise<ConversationLegacy> {
    return this.conversations.addConversation(description);
  }

  getConversations(): HasMany<ConversationLegacy> {
    return this.conversations;
  }
}

export interface UserConversationsLegacy extends HasMany<ConversationLegacy> {
  addConversation(description: ConversationDescription): Promise<ConversationLegacy>;
}
