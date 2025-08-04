import { HalLink, HalLinks } from '../archtype/index.js';

export interface UserDescription {
  name: string;
  email: string;
}

export interface UserLinks extends HalLinks {
  self: HalLink;
  accounts: HalLink;
  conversations: HalLink;
  'create-conversation': HalLink;
}
