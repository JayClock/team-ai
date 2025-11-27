import { SafeAny } from "./safe-any.js";

export interface Entity<
  TData extends Record<string, SafeAny> = Record<string, SafeAny>,
  TLinks extends Record<string, Entity> = Record<string, SafeAny>
> {
  data: TData;
  links: TLinks;
}
