import { describe, expect, it, vi } from 'vitest';
import Resource from '../../lib/resource/resource.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { Link } from '../../lib/links/link.js';
import { Entity } from '../../lib/archtype/entity.js';
import { SafeAny } from '../../lib/archtype/safe-any.js';

describe('ResourceRelation', () => {
  it('should keep per-hop variables when the same rel appears multiple times', async () => {
    const terminalState = { uri: 'https://api.example.com/target' };
    const terminalResource = {
      get: vi.fn().mockResolvedValue(terminalState),
    };

    const secondState = {
      follow: vi.fn().mockReturnValue(terminalResource),
    };
    const secondResource = {
      get: vi.fn().mockResolvedValue(secondState),
    };

    const firstState = {
      follow: vi.fn().mockReturnValue(secondResource),
    };
    const firstResource = {
      get: vi.fn().mockResolvedValue(firstState),
    };

    const mockClient = {
      go: vi.fn().mockReturnValue(firstResource),
    } as unknown as ClientInstance;

    const rootLink: Link = {
      rel: '',
      href: '/root',
      context: 'https://api.example.com',
    };

    const resource = new Resource<Entity>(mockClient, rootLink);

    const state = await resource
      .follow('item', { page: 1 } as SafeAny)
      .follow('item', { page: 2 } as SafeAny)
      .get();

    expect(state).toEqual(terminalState);
    expect(firstResource.get).toHaveBeenCalledTimes(1);
    expect(secondResource.get).toHaveBeenCalledTimes(1);
    expect(terminalResource.get).toHaveBeenCalledTimes(1);
    expect(firstState.follow).toHaveBeenCalledWith('item', { page: 1 });
    expect(secondState.follow).toHaveBeenCalledWith('item', { page: 2 });
  });

  it('should not prefetch terminal relation before write operations', async () => {
    const postResult = { uri: 'https://api.example.com/created' };
    const terminalResource = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(postResult),
    };

    const firstState = {
      follow: vi.fn().mockReturnValue(terminalResource),
    };
    const firstResource = {
      get: vi.fn().mockResolvedValue(firstState),
    };

    const mockClient = {
      go: vi.fn().mockReturnValue(firstResource),
    } as unknown as ClientInstance;

    const rootLink: Link = {
      rel: '',
      href: '/root',
      context: 'https://api.example.com',
    };

    const resource = new Resource<Entity>(mockClient, rootLink);

    const state = await resource.follow('item').post({
      data: { name: 'new' },
    } as SafeAny);

    expect(state).toEqual(postResult);
    expect(firstResource.get).toHaveBeenCalledTimes(1);
    expect(terminalResource.get).not.toHaveBeenCalled();
    expect(terminalResource.post).toHaveBeenCalledTimes(1);
    expect(firstState.follow).toHaveBeenCalledWith('item', {});
  });

  it('should use HEAD when useHead is enabled', async () => {
    const terminalState = { uri: 'https://api.example.com/target' };
    const terminalResource = {
      get: vi.fn().mockResolvedValue(terminalState),
    };

    const firstHeadState = {
      follow: vi.fn().mockReturnValue(terminalResource),
    };
    const firstResource = {
      head: vi.fn().mockResolvedValue(firstHeadState),
      get: vi.fn(),
    };

    const mockClient = {
      go: vi.fn().mockReturnValue(firstResource),
    } as unknown as ClientInstance;

    const rootLink: Link = {
      rel: '',
      href: '/root',
      context: 'https://api.example.com',
    };

    const resource = new Resource<Entity>(mockClient, rootLink);

    const state = await resource.follow('item').useHead().get();

    expect(state).toEqual(terminalState);
    expect(firstResource.head).toHaveBeenCalledWith({ headers: {} });
    expect(firstResource.get).not.toHaveBeenCalled();
    expect(firstHeadState.follow).toHaveBeenCalledWith('item', {});
  });

  it('should send transclude prefer header when preferTransclude is enabled', async () => {
    const terminalState = { uri: 'https://api.example.com/target' };
    const terminalResource = {
      get: vi.fn().mockResolvedValue(terminalState),
    };

    const firstState = {
      follow: vi.fn().mockReturnValue(terminalResource),
    };
    const firstResource = {
      get: vi.fn().mockResolvedValue(firstState),
    };

    const mockClient = {
      go: vi.fn().mockReturnValue(firstResource),
    } as unknown as ClientInstance;

    const rootLink: Link = {
      rel: '',
      href: '/root',
      context: 'https://api.example.com',
    };

    const resource = new Resource<Entity>(mockClient, rootLink);

    const state = await resource.follow('item').preferTransclude().get();

    expect(state).toEqual(terminalState);
    expect(firstResource.get).toHaveBeenCalledWith({
      headers: {
        Prefer: 'transclude=item',
      },
    });
    expect(firstState.follow).toHaveBeenCalledWith('item', {});
  });

  it('should prefetch terminal relation when preFetch is enabled', async () => {
    const postResult = { uri: 'https://api.example.com/created' };
    const terminalResource = {
      get: vi.fn().mockResolvedValue({ uri: 'https://api.example.com/item' }),
      post: vi.fn().mockResolvedValue(postResult),
    };

    const firstState = {
      follow: vi.fn().mockReturnValue(terminalResource),
    };
    const firstResource = {
      get: vi.fn().mockResolvedValue(firstState),
    };

    const mockClient = {
      go: vi.fn().mockReturnValue(firstResource),
    } as unknown as ClientInstance;

    const rootLink: Link = {
      rel: '',
      href: '/root',
      context: 'https://api.example.com',
    };

    const resource = new Resource<Entity>(mockClient, rootLink);

    await resource.follow('item').preFetch().post({
      data: { name: 'new' },
    } as SafeAny);

    expect(terminalResource.get).toHaveBeenCalledTimes(1);
    expect(terminalResource.post).toHaveBeenCalledTimes(1);
  });
});
