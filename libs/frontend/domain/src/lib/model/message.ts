import { Entity } from '../archtype/index.js';
import { MessageDescription } from '../description/index.js';

export class Message implements Entity<string, MessageDescription> {
  constructor(
    private identity: string,
    private description: MessageDescription
  ) {}

  getIdentity(): string {
    return this.identity;
  }

  getDescription(): MessageDescription {
    return this.description;
  }
}
