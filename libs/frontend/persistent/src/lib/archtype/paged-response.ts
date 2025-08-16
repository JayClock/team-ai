import { HalLink } from './hal-links.js';
import { HalEmbedded } from './hal-embedded.js';

export interface PageInfo {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface PageLinks {
  self: HalLink;
  first: HalLink;
  prev: HalLink;
  next: HalLink;
  last: HalLink;
}

export interface PagedResponse<T> {
  page: PageInfo;
  _embedded: HalEmbedded<T>;
  _links: PageLinks;
}
