import type { SchemaPlugin } from '../action/action.js';
import type { Cache } from '../cache/cache.js';

export interface Config {
  baseURL: string;
  sendUserAgent?: boolean;
  schemaPlugin?: SchemaPlugin;
  cache?: Cache;
}
