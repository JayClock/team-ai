import { SafeAny } from './safe-any.js';

export interface Entity<
  TData extends SafeAny = SafeAny,
  TLinks extends Record<string, Entity> = Record<string, SafeAny>,
> {
  data: TData;
  links: TLinks;
}
