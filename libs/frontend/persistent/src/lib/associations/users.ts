import {
  HalLinksDescription,
  User,
  Users as IUsers,
  UserLinks,
} from '@web/domain';
import { api } from '../../api.js';
import { UserConversations } from './user-conversations.js';

interface UserBackend extends HalLinksDescription {
  id: string;
  name: string;
  email: string;
}

export class Users implements IUsers {
  async findById(id: string): Promise<User> {
    const res = await api.get<UserBackend>(`/users/${id}`);
    return new User(
      res.data.id,
      {
        name: res.data.name,
        email: res.data.email,
        _links: res.data._links,
      },
      new UserConversations(res.data._links as UserLinks)
    );
  }
}
