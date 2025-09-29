import { UserLegacy, UsersLegacy as IUsers } from '@web/domain';
import { UserConversationsLegacy } from './user-conversations-legacy.js';
import { UserResponse } from '../responses/user-response.js';
import { inject, injectable } from 'inversify';
import { Axios } from 'axios';
import { HalLinks } from '../archtype/hal-links.js';

@injectable()
export class UsersLegacy implements IUsers {
  constructor(
    @inject(Axios) private axios: Axios,
    @inject('Factory<UserConversationsLegacy>')
    private userConversationsFactory: (links: HalLinks) => UserConversationsLegacy
  ) {}

  async findById(id: string): Promise<UserLegacy> {
    const res = await this.axios.get<UserResponse>(`/api/users/${id}`);
    return new UserLegacy(
      res.data.id,
      {
        name: res.data.name,
        email: res.data.email,
      },
      this.userConversationsFactory(res.data._links)
    );
  }
}
