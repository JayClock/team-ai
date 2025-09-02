import { beforeAll, describe, expect, Mocked } from 'vitest';
import { container } from '../../lib/container.js';
import { Axios } from 'axios';
import { ENTRANCES, User } from '@web/domain';
import { Factory } from 'inversify';
import { Users } from '../../lib/associations/index.js';

describe('Users', () => {
  let users: Users;
  const mockAxios = {
    get: vi.fn(),
  } as unknown as Mocked<Axios>;

  beforeAll(() => {
    container.rebindSync(Axios).toConstantValue(mockAxios);
    container
      .rebindSync<Factory<object>>('Factory<UserConversations>')
      .toFactory(() => {
        return () => ({});
      });
    users = container.get(ENTRANCES.USERS);
  });

  it('should find user by id', async () => {
    vi.spyOn(mockAxios, 'get').mockResolvedValue({ data: {} });
    const user = await users.findById('1');
    expect(user).toBeInstanceOf(User);
  });
});
