import { User, Users as IUsers } from '@web/domain';
import { api } from '../../api.js';
import { UserConversations } from './user-conversations.js';
import { UserResponse } from '../responses/user-response.js';

export class Users implements IUsers {
  async findById(id: string): Promise<User> {
    const res = await api.get<UserResponse>(`/users/${id}`);
    return new User(
      res.data.id,
      {
        name: res.data.name,
        email: res.data.email,
      },
      new UserConversations(res.data._links)
    );
  }
}
