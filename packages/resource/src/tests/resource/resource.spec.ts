import { describe, expect, vi } from 'vitest';
import { Account, User } from '../fixtures/interface.js';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import halConversations from '../fixtures/hal-conversations.json' with { type: 'json' };
import { HalStateFactory } from '../../lib/state/hal.js';
import { HalResource } from 'hal-types';
import { Client } from '../../lib/client.js';
import { Resource } from '../../lib/resource/resource.js';
import { HalState } from '../../lib/state/hal-state.js';

const mockClient = {
  go: vi.fn(),
  fetch: vi.fn()
} as unknown as Client;
describe('Resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle root resource request without data', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue(halUser)
    } as unknown as Response;

    vi.spyOn(mockClient, 'fetch').mockResolvedValue(mockResponse);

    const rootResource = new Resource<User>(mockClient as Client, '/api/users/1', []);
    const result = await rootResource.request();

    expect(mockClient.fetch).toHaveBeenCalledWith('/api/users/1', {
      method: 'GET',
      body: undefined,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    expect(result.data.id).toBe('1');
    expect(result.data.name).toBe('JayClock');
    expect(result.uri).toBe('/api/users/1');
  });

  it('should handle root resource request with data', async () => {
    const requestData = { name: 'Updated Name' };
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ ...halUser, name: 'Updated Name' })
    } as unknown as Response;

    vi.spyOn(mockClient, 'fetch').mockResolvedValue(mockResponse);

    const rootResource = new Resource<User>(mockClient as Client, '/api/users/1', []);
    const result = await rootResource.request(requestData);

    expect(mockClient.fetch).toHaveBeenCalledWith('/api/users/1', {
      method: 'GET',
      body: JSON.stringify(requestData),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    expect(result.data.name).toBe('Updated Name');
  });

  it('should handle embedded array resource request', async () => {
    const userState = HalStateFactory<User>(
      mockClient as Client,
      '/api/users/1',
      halUser as HalResource
    );

    const mockRootResource = {
      request: vi.fn().mockResolvedValue(userState)
    } as unknown as Resource<User>;

    vi.spyOn(mockClient, 'go').mockReturnValue(mockRootResource);

    const accountsResource = userState.follow('accounts');
    const result = await accountsResource.request();

    expect(result.collection).toHaveLength(2);
    expect(result.uri).toBe('/api/users/1/accounts');

    const firstAccount = result.collection[0] as HalState<Account>;
    expect(firstAccount.data.id).toBe('1');
    expect(firstAccount.data.provider).toBe('github');
    expect(firstAccount.data.providerId).toBe('35857909');
  });

  it('should handle embedded single resource request', async () => {
    const userState = HalStateFactory<User>(
      mockClient as Client,
      '/api/users/1',
      halUser as HalResource
    );

    const mockRootResource = {
      request: vi.fn().mockResolvedValue(userState)
    } as unknown as Resource<User>;

    vi.spyOn(mockClient, 'go').mockReturnValue(mockRootResource);

    const latestConversationResource = userState.follow('latest-conversation');
    const result = await latestConversationResource.request();

    expect(result.data.id).toBe('conv-456');
    expect(result.data.title).toBe('Recent chat about HATEOAS');
    expect(result.uri).toBe('/api/conversations/conv-456');
  });

  it('should handle non-embedded resource request with HTTP call', async () => {
    const userState = HalStateFactory<User>(
      mockClient as Client,
      '/api/users/1',
      halUser as HalResource
    );

    const userStateWithoutEmbedded = {
      ...userState,
      getEmbedded: vi.fn().mockReturnValue(undefined)
    } as unknown as HalState<User>;

    const mockRootResource = {
      request: vi.fn().mockResolvedValue(userStateWithoutEmbedded)
    } as unknown as Resource<User>;

    vi.spyOn(mockClient, 'go').mockReturnValue(mockRootResource);

    const mockResponse = {
      json: vi.fn().mockResolvedValue(halConversations)
    } as unknown as Response;

    vi.spyOn(mockClient, 'fetch').mockResolvedValue(mockResponse);

    const conversationsResource = userState.follow('conversations').withTemplateParameters({ page: 1, pageSize: 10 });
    const result = await conversationsResource.request();

    expect(mockClient.fetch).toHaveBeenCalledWith('/api/users/1/conversations?page=1&pageSize=10', {
      method: 'GET',
      body: undefined,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    expect(result.collection).toHaveLength(40);
    expect(result.uri).toBe('/api/users/1');
  });

  it('should handle network error gracefully', async () => {
    const networkError = new Error('Network error');
    vi.spyOn(mockClient, 'fetch').mockRejectedValue(networkError);

    const rootResource = new Resource<User>(mockClient as Client, '/api/users/1', []);

    await expect(rootResource.request()).rejects.toThrow('Network error');
    expect(mockClient.fetch).toHaveBeenCalledWith('/api/users/1', {
      method: 'GET',
      body: undefined,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  });

  it('should handle invalid JSON response', async () => {
    const mockResponse = {
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
    } as unknown as Response;

    vi.spyOn(mockClient, 'fetch').mockResolvedValue(mockResponse);

    const rootResource = new Resource<User>(mockClient as Client, '/api/users/1', []);

    await expect(rootResource.request()).rejects.toThrow('Invalid JSON');
    expect(mockClient.fetch).toHaveBeenCalledWith('/api/users/1', {
      method: 'GET',
      body: undefined,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  });
});
