import { HalLinks } from '../archtype/hal-links.js';

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  _links: HalLinks;
}
