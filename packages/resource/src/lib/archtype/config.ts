import type { SchemaPlugin } from '../action/action.js';

export interface Config {
  baseURL: string;
  sendUserAgent?: boolean;
  schemaPlugin?: SchemaPlugin;
}
