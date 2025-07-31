import { Entity } from '../archtype/entity.js';
import { UserDescription } from '../description/index.js';
import { Links } from '../archtype/links.js';

export class User implements Entity<string, UserDescription> {
  constructor(
    private identity: string,
    private description: UserDescription & Links
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): UserDescription {
    return this.description;
  }
}
