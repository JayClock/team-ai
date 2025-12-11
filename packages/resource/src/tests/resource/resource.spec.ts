import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { State } from '../../lib/state/state.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { Resource } from '../../lib/index.js';
import { LinkResource } from '../../lib/resource/link-resource.js';

const mockFetcher = {
  fetchOrThrow: vi.fn()
};

const mockClient = {
  bookmarkUri: 'https://www.test.com/',
  fetcher: mockFetcher,
  getStateForResponse:vi.fn()
} as unknown as ClientInstance;

describe('StateResource', () => {
  const resource:Resource<User>  = new LinkResource(mockClient,{rel:'',href:'/api/users/1'});
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  let userState: State<User>;

  beforeAll(async ()=>{
    const response = Response.json(halUser);
    const mockUserState =  await halStateFactory.create<User>(
      mockClient,
      '/api/users/1',
      response
    );
    vi.spyOn(mockClient.fetcher,'fetchOrThrow').mockResolvedValue(response);
    vi.spyOn(mockClient,'getStateForResponse').mockResolvedValue(mockUserState);
    userState = await resource.request();
    expect(userState).toBe(mockUserState);
  })

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should return new link resource with resource follow',()=>{
    expect(resource.follow('accounts')).toBeInstanceOf(LinkResource);
  })

  it('should generate states from user embedded accounts array', async () => {
    const accountsResource = userState.follow('accounts');
    const accounts =  await accountsResource.request();
    expect(accounts.collection.length).toEqual(halUser._embedded.accounts.length)
  });

  it('should generate states from user embedded latest-conversation', async () => {
    const latestConversationResource = userState.follow('latest-conversation');
    const conversation =  await latestConversationResource.request();

    expect(halUser._embedded['latest-conversation']).toEqual(expect.objectContaining(conversation.data))
  });

  it('should handle non-embedded resource request with HTTP call', async () => {
    const mockResponse = {
      url: new URL('/api/users/1/conversations?page=1&pageSize=10', mockClient.bookmarkUri).toString(),
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(mockResponse);

    const link: Link = { ...halUser._links.conversations, rel: 'conversations'};

    const options = {
      query: {
        page: 1,
        pageSize: 10
      }
    };
    const conversationsResource = userState.follow('conversations',{
      page: 1,
      pageSize: 10
    });
    await conversationsResource.request();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(link, options);

    expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
      mockResponse.url,
      mockResponse,
      'conversations'
    );
  });

  it('should verify request body with hal template', async () => {
    await expect(userState.follow('create-conversation').withRequestOptions({ body: { title: 123 } }).request()).rejects.toThrow('Invalid');
  });
});
