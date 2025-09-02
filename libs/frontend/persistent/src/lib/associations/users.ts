import { User, Users as IUsers } from '@web/domain';
import { UserConversations } from './user-conversations.js';
import { UserResponse } from '../responses/user-response.js';
import { inject, injectable } from 'inversify';
import { Axios } from 'axios';
import { HalLinks } from '../archtype/hal-links.js';

@injectable()
export class Users implements IUsers {
  constructor(
    @inject(Axios) private axios: Axios,
    @inject('Factory<UserConversations>')
    private userConversationsFactory: (links: HalLinks) => UserConversations
  ) {}

  async findById(id: string): Promise<User> {
    const res = await this.axios.get<UserResponse>(`/api/users/${id}`);
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
