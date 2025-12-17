import { vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { ClientInstance } from '../../lib/client-instance.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { Resource } from '../../lib/index.js';
import { Fetcher } from '../../lib/http/fetcher.js';
import { State } from '../../lib/index.js';

export const mockFetcher = {
  fetchOrThrow: vi.fn(),
} as unknown as Fetcher;

export const mockClient = {
  bookmarkUri: 'https://www.test.com/',
  fetcher: mockFetcher,
  getStateForResponse: vi.fn(),
  go: vi.fn(),
  cacheState: vi.fn(),
  cache: {
    get: vi.fn(),
  },
} as unknown as ClientInstance;

export const setupUserState = async (): Promise<{
  resource: Resource<User>;
  userState: State<User>;
  halStateFactory: HalStateFactory;
}> => {
  const link = {
    rel: '',
    href: '/api/users/1',
    context: mockClient.bookmarkUri,
  };
  const resource: Resource<User> = new Resource(mockClient, link);
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);

  const response = Response.json(halUser);
  const mockUserState = await halStateFactory.create<User>(
    mockClient,
    link,
    response,
  );

  vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(response);
  vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(mockUserState);

  const userState = await resource.request();

  return { resource, userState, halStateFactory };
};

export const clearAllMocks = () => {
  vi.clearAllMocks();
};
