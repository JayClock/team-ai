import { describe, expect, it } from 'vitest';
import { getRoleById, listRoles } from './role-service';

describe('role service', () => {
  it('lists routa core roles', async () => {
    const payload = await listRoles();

    expect(payload.items.map((role) => role.id)).toEqual([
      'ROUTA',
      'CRAFTER',
      'GATE',
      'DEVELOPER',
    ]);
  });

  it('returns a single role by id', async () => {
    await expect(getRoleById('GATE')).resolves.toMatchObject({
      id: 'GATE',
      name: 'Gate Reviewer',
    });
  });
});
