import { User, Users as IUsers } from '@web/domain';
import { api } from '../../api.js';
import { UserConversations } from './user-conversations.js';
import { UserLinks, UserResponse } from '../responses/user-response.js';
import { inject, injectable } from 'inversify';

@injectable()
export class Users implements IUsers {
  constructor(
    @inject('Factory<UserConversations>')
    private readonly userConversationsFactory: (
      links: UserLinks
    ) => UserConversations
  ) {}

  async findById(id: string): Promise<User> {
    const res = await api.get<UserResponse>(`/users/${id}`);
    return new User(
      res.data.id,
      {
        name: res.data.name,
        email: res.data.email,
      },
      this.userConversationsFactory(res.data._links)
    );
  }
}
