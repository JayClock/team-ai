import { describe, expect, vi } from 'vitest';
import { Conversation, User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { State } from '../../lib/state/state.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { Collection, Resource } from '../../lib/index.js';
import { LinkResource } from '../../lib/resource/link-resource.js';
import { resolve } from '../../lib/util/uri.js';

const mockFetcher = {
  fetchOrThrow: vi.fn()
};

const mockClient = {
  bookmarkUri: 'https://www.test.com/',
  fetcher: mockFetcher,
  getStateForResponse: vi.fn(),
  go: vi.fn(),
  cacheState: vi.fn(),
  cache: {
    get:vi.fn()
  }
} as unknown as ClientInstance;

describe('StateResource', () => {
  const resource: Resource<User> = new LinkResource(mockClient, { rel: '', href: '/api/users/1' });
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  let userState: State<User>;

  beforeAll(async () => {
    const response = Response.json(halUser);
    const mockUserState = await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      response
    );
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(response);
    vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(mockUserState);
    userState = await resource.request();
    expect(userState).toBe(mockUserState);
    expect(mockClient.cacheState).toHaveBeenCalledWith(userState)
  })

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should return new link resource with resource follow', () => {
    expect(resource.follow('accounts')).toBeInstanceOf(LinkResource);
  })

  it('should generate states from user embedded accounts array', async () => {
    const accountsResource = userState.follow('accounts');
    const accounts = await accountsResource.request();
    expect(accounts.collection.length).toEqual(halUser._embedded.accounts.length)
    expect(mockClient.cacheState).toHaveBeenCalledWith(accounts)
  });

  it('should generate states from user embedded latest-conversation', async () => {
    const latestConversationResource = userState.follow('latest-conversation');
    const conversation = await latestConversationResource.request();
    expect(halUser._embedded['latest-conversation']).toEqual(expect.objectContaining(conversation.data))
    expect(mockClient.cacheState).toHaveBeenCalledWith(conversation)
  });

  it('should verify request body with hal template', async () => {
    vi.spyOn(mockClient, 'go').mockReturnValue(new LinkResource(mockClient, { ...halUser._links['latest-conversation'], rel: 'latest-conversation' }))
    await expect(userState.follow('create-conversation').withPost({ data: { title: 123 } }).request()).rejects.toThrow('Invalid');
  });
});
