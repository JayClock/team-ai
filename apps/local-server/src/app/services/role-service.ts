import type { RoleListPayload, RolePayload, RoleValue } from '../schemas/role';
import { ProblemError } from '@orchestration/runtime-acp';

const roles: RolePayload[] = [
  {
    id: 'ROUTA',
    name: 'Routa Coordinator',
    description: 'Coordinates session intent and routes work into tasks.',
    responsibilities: [
      'Interpret session goals',
      'Decide whether to decompose work',
      'Coordinate downstream specialists',
    ],
  },
  {
    id: 'CRAFTER',
    name: 'Crafter',
    description: 'Implements changes and produces deliverables.',
    responsibilities: [
      'Modify code or content',
      'Keep work scoped to the task',
      'Leave outputs ready for review',
    ],
  },
  {
    id: 'GATE',
    name: 'Gate Reviewer',
    description: 'Verifies work against acceptance and review criteria.',
    responsibilities: [
      'Run validation checks',
      'Review work against acceptance criteria',
      'Produce pass or fail verdicts',
    ],
  },
  {
    id: 'DEVELOPER',
    name: 'Solo Developer',
    description: 'Handles direct execution mode without decomposition.',
    responsibilities: [
      'Plan and implement directly',
      'Verify the result',
      'Return a single-threaded outcome',
    ],
  },
];

function throwRoleNotFound(roleId: string): never {
  throw new ProblemError({
    type: 'https://team-ai.dev/problems/role-not-found',
    title: 'Role Not Found',
    status: 404,
    detail: `Role ${roleId} was not found`,
  });
}

export async function listRoles(): Promise<RoleListPayload> {
  return {
    items: roles,
  };
}

export async function getRoleById(roleId: string): Promise<RolePayload> {
  const role = roles.find((candidate) => candidate.id === roleId);

  if (!role) {
    throwRoleNotFound(roleId);
  }

  return role;
}

export function getKnownRoleValues(): RoleValue[] {
  return roles.map((role) => role.id);
}
