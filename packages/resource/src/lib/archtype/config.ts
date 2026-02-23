import type { SchemaPlugin } from '../action/action.js';
import type { Cache } from '../cache/cache.js';
import type { StateFactory } from '../state/state.js';

export type ContentTypeFactoryConfig =
  | StateFactory
  | [StateFactory, string]
  | {
      factory: StateFactory;
      quality?: string;
    };

export interface Config {
  baseURL: string;
  sendUserAgent?: boolean;
  schemaPlugin?: SchemaPlugin;
  cache?: Cache;
  contentTypeMap?: Record<string, ContentTypeFactoryConfig>;
}
