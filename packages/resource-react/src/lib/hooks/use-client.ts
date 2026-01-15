import { Client } from '@hateoas-ts/resource';
import { useContext } from 'react';
import { ClientContext } from '../provider';

/**
 * Hook to access the HATEOAS client instance from context.
 *
 * Must be used within a {@link ResourceProvider} component.
 *
 * @category Hooks
 * @returns The HATEOAS client instance
 * @throws Error if used outside of ResourceProvider
 *
 * @example
 * ```tsx
 * import { useClient } from '@hateoas-ts/resource-react';
 * import type { User } from './types';
 *
 * function UserProfile({ userId }: { userId: string }) {
 *   const client = useClient();
 *
 *   useEffect(() => {
 *     client.go<User>(`/api/users/${userId}`).get().then(setUser);
 *   }, [client, userId]);
 *
 *   // ...
 * }
 * ```
 */
export function useClient(): Client {
  const context = useContext(ClientContext);
  if (!context.client) {
    throw new Error(
      'To use useClient, you must have a <ResourceProvider> component set up',
    );
  }
  return context.client;
}
