import { HalEmbedded } from './hal-embedded.js';

export interface HalEmbeddedDescription<T>{
  _embedded: HalEmbedded<T>;
}
