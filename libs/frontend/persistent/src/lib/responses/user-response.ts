import { HalLink } from '../archtype/hal-links.js';

export interface UserLinks {
  self: HalLink;
  conversations: HalLink;
  'create-conversation': HalLink;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  _links: UserLinks;
}
