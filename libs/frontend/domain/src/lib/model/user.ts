import { UserDescription } from '../description/index.js';
import { BaseDescription, Entity, Links } from '../archtype/index.js';

interface UserLinks extends Links {
  self: {
    href: string;
  };
  accounts: {
    href: string;
  };
  conversations: {
    href: string;
  };
}

export class User implements Entity<string, UserDescription> {
  constructor(
    private identity: string,
    private description: UserDescription & BaseDescription
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): UserDescription {
    return this.description;
  }

  getLinks(): UserLinks {
    return this.description._links as UserLinks;
  }
}
