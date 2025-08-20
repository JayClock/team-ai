import { HalLinks } from '../archtype/hal-links.js';

export interface MessageResponse {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  _links: HalLinks;
}
