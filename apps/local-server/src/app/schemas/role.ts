export const roleValues = ['ROUTA', 'CRAFTER', 'GATE', 'DEVELOPER'] as const;

export type RoleValue = (typeof roleValues)[number];

export interface RolePayload {
  description: string;
  id: RoleValue;
  name: string;
  responsibilities: string[];
}

export interface RoleListPayload {
  items: RolePayload[];
}

export function isRoleValue(value: string): value is RoleValue {
  return roleValues.includes(value as RoleValue);
}
