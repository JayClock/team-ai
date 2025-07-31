import { User } from './user.js';

export interface Users {
  findById(id: string): Promise<User>;
}
