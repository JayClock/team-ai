import { Entity } from '../archtype/entity.js';
import { ContextDescription } from '../description/index.js';

export class Context implements Entity<string, ContextDescription> {
  constructor(
    private identity: string,
    private description: ContextDescription
  ) {}

  getIdentity(): string {
    return this.identity;
  }
  getDescription(): ContextDescription {
    return this.description;
  }
}
