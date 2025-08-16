import { beforeAll, describe, expect, Mocked } from 'vitest';
import { Users } from '../../lib/associations/index.js';
import { container } from '../../lib/container.js';
import { Axios } from 'axios';
import { User } from '@web/domain';
import { Factory } from 'inversify';

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
    users = container.get(Users);
  });

  it('should find user by id', async () => {
    vi.spyOn(mockAxios, 'get').mockResolvedValue({ data: {} });
    const user = await users.findById('1');
    expect(user).toBeInstanceOf(User);
  });
});
