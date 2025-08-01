import { HalLinks } from './hal-links.js';

export interface Entity<Identity, Description> {
  getIdentity(): Identity;
  getDescription(): Description;
  getLinks(): HalLinks;
}
