import { UserLegacy } from './user-legacy.js';

export interface UsersLegacy {
  findById(id: string): Promise<UserLegacy>;
}
