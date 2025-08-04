import {
  Conversation,
  ConversationDescription,
  HalLinksDescription,
  UserConversations as IUserConversations,
  UserLinks,
} from '@web/domain';
import { api } from '../../api.js';

interface BackendConversation extends HalLinksDescription {
  id: string;
  title: string;
}

export class UserConversations implements IUserConversations {
  constructor(private userLinks: UserLinks) {}

  async addConversation(
    description: ConversationDescription
  ): Promise<Conversation> {
    const { data } = await api.post<BackendConversation>(
      this.userLinks['create-conversation'].href,
      description
    );
    return new Conversation(data.id, {
      title: data.title,
      _links: data._links,
    });
  }
}
