import { ResourceProvider } from '../../lib/provider';
import * as React from 'react';
import { Client } from '@hateoas/resource';
import { vi } from 'vitest';

export const mockClient = {
  go: vi.fn(),
} as unknown as Client;

export const wrapper = ({ children }: { children: React.ReactNode }) => {
  return <ResourceProvider client={mockClient}>{children}</ResourceProvider>;
};
