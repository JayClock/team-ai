import { Entity } from '@hateoas-ts/resource';
import { User } from './user.js';

export type Root = Entity<
  never,
  {
    login: never;
    register: never;
    'login-oauth-github': never;
    me: User;
    logout: never;
  }
>;
