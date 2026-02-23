import { describe, expect, it } from 'vitest';
import { createClient } from '../lib/create-client.js';

describe('createClient', () => {
  it('should create isolated client instances with independent base URLs', () => {
    const clientA = createClient({ baseURL: 'https://api-a.example.com' });
    const clientB = createClient({ baseURL: 'https://api-b.example.com' });

    expect(clientA.go('/users').uri).toBe('https://api-a.example.com/users');
    expect(clientB.go('/users').uri).toBe('https://api-b.example.com/users');
  });
});
