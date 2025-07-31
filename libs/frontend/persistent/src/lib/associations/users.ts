import { Links, User, Users as IUsers } from '@web/domain';
import { api } from '../../api.js';

interface UserBackend extends Links {
  id: string;
  name: string;
  email: string;
}

export class Users implements IUsers {
  async findById(id: string): Promise<User> {
    const res = await api.get<UserBackend>(`/users/${id}`);
    return new User(res.data.id, {
      name: res.data.name,
      email: res.data.email,
      _links: res.data._links,
    });
  }
}
