import { Links } from './links.js';

export interface Entity<Identity, Description> {
  getIdentity(): Identity;
  getDescription(): Description;

  getLinks(): Links;
}
