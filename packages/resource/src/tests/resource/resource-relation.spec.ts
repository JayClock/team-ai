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
    expect(firstState.follow).toHaveBeenCalledWith('item', { page: 1 });
    expect(secondState.follow).toHaveBeenCalledWith('item', { page: 2 });
  });
});
