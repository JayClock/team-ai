import { describe, expect } from 'vitest';
import { Client } from '../lib/index.js';

describe('Client', () => {
  const client = new Client({ baseURL: 'http://localhost:4200' });

  it('should return a new resource', () => {
    const resource = client.root('/api/users/1');
    expect(resource.uri).toEqual('/api/users/1');
    expect(resource.client).toBe(client);
  });
});
