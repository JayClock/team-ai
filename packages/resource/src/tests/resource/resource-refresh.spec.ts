import { describe, expect, vi } from 'vitest';
import { User } from '../fixtures/interface.js';
import { Resource, State } from '../../lib/index.js';
import { clearAllMocks, mockClient, setupUserState } from './mock-setup.js';

describe('Resource REFRESH Requests', () => {
  let resource: Resource<User>;

  beforeAll(async () => {
    const setup = await setupUserState();
    resource = setup.resource;
  });

  beforeEach(() => {
    clearAllMocks();
  });

  it('should bypass cache and force a no-cache GET request', async () => {
    const refreshedState = { uri: resource.uri } as State<User>;

    vi.spyOn(mockClient.cache, 'get').mockReturnValue(refreshedState);
    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(refreshedState);

    const result = await resource.refresh();

    expect(result).toBe(refreshedState);
    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
      resource.uri,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-cache',
      }),
    );
  });

  it('should de-duplicate identical refresh requests made concurrently', async () => {
    const refreshedState = { uri: resource.uri } as State<User>;
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

    vi.spyOn(mockClient.fetcher, 'fetchOrThrow').mockReturnValue(responsePromise);
    vi.spyOn(mockClient, 'getStateForResponse').mockResolvedValue(refreshedState);

    const request1 = resource.refresh();
    const request2 = resource.refresh();

    expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledTimes(1);

    resolveResponse(new Response(null, { status: 200 }));

    const [result1, result2] = await Promise.all([request1, request2]);
    expect(result1).toBe(result2);
  });
});
