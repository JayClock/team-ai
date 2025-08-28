import { HalLink, HalLinks } from './hal-links.js';
import { HalEmbedded } from './hal-embedded.js';

export interface PageInfo {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface PagedResponse<T> {
  page: PageInfo;
  _embedded: HalEmbedded<T>;
  _links: HalLinks;
}
