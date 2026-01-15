import { Client } from '@hateoas-ts/resource';
import * as React from 'react';

/**
 * Props for the ResourceProvider component.
 * @internal
 */
type Props = {
  /** The HATEOAS client instance to provide to all child components */
  client: Client;
  /** React children to render within the provider */
  children: React.ReactNode;
};

/**
 * React context for the HATEOAS client.
 * @internal
 */
export const ClientContext = React.createContext<{
  client?: Client;
}>({});

/**
 * Context provider that makes the HATEOAS client available to all child components.
 *
 * Wrap your application (or a subtree) with this provider to enable
 * {@link useClient}, {@link useResource}, {@link useInfiniteCollection},
 * and other hooks.
 *
 * @category Provider
 *
 * @example
 * ```tsx
 * import { createClient } from '@hateoas-ts/resource';
 * import { ResourceProvider } from '@hateoas-ts/resource-react';
 *
 * const client = createClient({ baseURL: 'https://api.example.com' });
 *
 * function App() {
 *   return (
 *     <ResourceProvider client={client}>
 *       <YourApp />
 *     </ResourceProvider>
 *   );
 * }
 * ```
 */
export const ResourceProvider: React.FC<Props> = ({ client, children }) => {
  return (
    <ClientContext.Provider value={{ client }}>
      {children}
    </ClientContext.Provider>
  );
};
