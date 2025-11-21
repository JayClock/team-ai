import { SafeAny } from "./safe-any.js";

export interface Entity<
  TDescription extends Record<string, SafeAny> = Record<string, SafeAny>,
  TRelation extends Record<string, Entity> = Record<string, SafeAny>
> {
  description: TDescription;
  relations: TRelation;
}
