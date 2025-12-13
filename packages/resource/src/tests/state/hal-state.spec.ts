import { describe, expect } from 'vitest';
import halUser from '../fixtures/hal-user.json' with { type: 'json' };
import { BaseState } from '../../lib/state/base-state.js';
import { SafeAny } from '../../lib/archtype/safe-any.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { container } from '../../lib/container.js';
import { TYPES } from '../../lib/archtype/injection-types.js';
import { HalStateFactory } from '../../lib/state/hal-state/hal-state.factory.js';
import { User } from '../fixtures/interface.js';
import { StateResource } from '../../lib/resource/state-resource.js';

const mockClient = {} as ClientInstance;

describe('HalState', async () => {
  const halStateFactory: HalStateFactory = container.get(TYPES.HalStateFactory);
  const mockHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Language': 'zh-CN',
    'Content-Location': '/api/resource/123',
    'ETag': '"abc123def456"',
    'Expires': 'Wed, 21 Oct 2025 07:28:00 GMT',
    'Last-Modified': 'Mon, 15 Sep 2024 12:00:00 GMT',
    'Warning': '299 - "Deprecated API"',
    'Deprecation': 'true',
    'Sunset': 'Wed, 21 Oct 2026 07:28:00 GMT',
    'Title': 'API Resource Details'
  };
  const state = await halStateFactory.create<User>(mockClient, '/api/users/1', Response.json(halUser, { headers: mockHeaders }));

  it('should get pure data with out hal info', () => {
    expect(state.data).toEqual({
      id: '1',
      name: 'JayClock',
      email: 'z891853602@gmail.com'
    });
  });

  it('should filter content headers', () => {
    const contentHeaders = state.contentHeaders();

    expect(contentHeaders).toBeInstanceOf(Headers);

    expect(contentHeaders.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(contentHeaders.get('Content-Language')).toBe('zh-CN');
    expect(contentHeaders.get('Content-Location')).toBe('/api/resource/123');
    expect(contentHeaders.get('ETag')).toBe('"abc123def456"');
    expect(contentHeaders.get('Expires')).toBe('Wed, 21 Oct 2025 07:28:00 GMT');
    expect(contentHeaders.get('Last-Modified')).toBe('Mon, 15 Sep 2024 12:00:00 GMT');
    expect(contentHeaders.get('Warning')).toBe('299 - "Deprecated API"');
    expect(contentHeaders.get('Deprecation')).toBe('true');
    expect(contentHeaders.get('Sunset')).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
    expect(contentHeaders.get('Title')).toBe('API Resource Details');

    expect([...contentHeaders.entries()].length).toBe(10);
  })

  it('should serialize body to string', () => {
    const resource = JSON.parse(state.serializeBody() as string);
    expect(halUser).toEqual(expect.objectContaining(resource))
  })

  it('should follow existed lint and return new state resource', () => {
    expect(state.follow('accounts')).toBeInstanceOf(StateResource)
  })

  it('should throw error with not existed link', () => {
    expect(() => state.follow('not existed' as SafeAny)).toThrow(
      `rel not existed is not exited`
    );
  });

  it('should create collection with existed embedded', async () => {
    const state = await halStateFactory.create(mockClient, '/api/users/1', Response.json(halUser), 'accounts');
    expect(state.collection.length).toEqual(halUser._embedded.accounts.length);
  });

  it('should create forms with existed templates', () => {
    expect(state.getForm('create-conversation', 'POST')?.uri).toEqual(halUser._templates['create-conversation'].target);
  });

  it('should clone state', () => {
    const cloned = state.clone();
    expect(cloned).toBeInstanceOf(BaseState);
    expect(cloned).not.toBe(state);
    expect(cloned.uri).toEqual(state.uri);
    expect(cloned.data).not.toBe(state.data)
    expect(cloned.data).toEqual(state.data);
  });
});
