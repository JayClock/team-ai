# @hateoas-ts/resource-react

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

**Language**: [English](./README.md) | [中文](./README_zh.md)

`@hateoas-ts/resource-react` provides React hooks and components for interacting with REST APIs that follow the HAL (Hypertext Application Language) specification. It is the React integration layer for [`@hateoas-ts/resource`](../resource/README.md).

## 📚 Documentation

To better understand the HATEOAS client implementation and React integration, it's recommended to read the documentation in the following order:

1. [Smart Domain DDD Architecture](../../libs/backend/README.md) - Complete architecture design documentation to understand the core design principles
2. [`@hateoas-ts/resource` Documentation](../resource/README.md) - Core TypeScript/JavaScript client library documentation
3. **This Documentation** - React hooks and components integration

## Installation

```bash
npm install @hateoas-ts/resource-react
# or
yarn add @hateoas-ts/resource-react
# or
pnpm add @hateoas-ts/resource-react
```

## Core Concepts

The `@hateoas-ts/resource-react` library provides React-friendly wrappers around the core `@hateoas-ts/resource` library:

- **ResourceProvider**: Context provider for injecting the HATEOAS client
- **useClient**: Hook to access the client instance
- **useInfiniteCollection**: Hook for handling infinite scroll/pagination of collection resources
- **useResolveResource**: Internal hook for resolving resource-like objects

## Basic Usage

### 1. Wrap Your App with ResourceProvider

First, create a client instance and wrap your application with `ResourceProvider`:

```tsx
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider } from '@hateoas-ts/resource-react';

const client = createClient({
  baseURL: 'https://api.example.com',
});

function App() {
  return <ResourceProvider client={client}>{/* Your app components */}</ResourceProvider>;
}
```

### 2. Define Entity Types

Use the `Entity` and `Collection` types from `@hateoas-ts/resource` to define your data models:

```typescript
import { Entity, Collection } from '@hateoas-ts/resource';

// Define Account entity
export type Account = Entity<
  {
    id: string;
    provider: string;
    providerId: string;
  },
  {
    self: Account;
  }
>;

// Define Conversation entity
export type Conversation = Entity<
  {
    id: string;
    title: string;
  },
  {
    self: Conversation;
  }
>;

// Define User entity with relationships
export type User = Entity<
  {
    id: string;
    name: string;
    email: string;
  },
  {
    self: User;
    accounts: Collection<Account>;
    conversations: Collection<Conversation>;
    'create-conversation': Conversation;
  }
>;
```

### 3. Use useClient Hook

Access the client instance in your components using the `useClient` hook:

```tsx
import { useClient } from '@hateoas-ts/resource-react';
import type { User } from './types';

function UserProfile({ userId }: { userId: string }) {
  const client = useClient();

  const [user, setUser] = useState<UserState | null>(null);

  useEffect(() => {
    client.go<User>(`/api/users/${userId}`).request().then(setUser);
  }, [client, userId]);

  if (!user) return <div>Loading...</div>;

  return <div>{user.data.name}</div>;
}
```

### 4. Use useInfiniteCollection Hook

The `useInfiniteCollection` hook is designed for handling paginated collections with infinite scroll functionality:

```tsx
import { useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useClient } from '@hateoas-ts/resource-react';
import type { User } from './types';

function UserConversations({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const { items, loading, hasNextPage, error, loadNextPage } = useInfiniteCollection(userResource.follow('conversations'));

  return (
    <div>
      <h2>Conversations</h2>

      {error && <div>Error: {error.message}</div>}

      <ul>
        {items.map((conversationState) => (
          <li key={conversationState.data.id}>{conversationState.data.title}</li>
        ))}
      </ul>

      {loading && <div>Loading more...</div>}

      {hasNextPage && !loading && <button onClick={loadNextPage}>Load More</button>}
    </div>
  );
}
```

## API Reference

### ResourceProvider

Context provider component that makes the HATEOAS client available to all child components.

**Props:**

- `client: Client` - The HATEOAS client instance
- `children: React.ReactNode` - Child components

**Example:**

```tsx
<ResourceProvider client={client}>
  <App />
</ResourceProvider>
```

### useClient()

Hook to access the HATEOAS client instance from the context.

**Return value:**

- `Client` - The HATEOAS client instance

**Throws:**

- Error if used outside of `ResourceProvider`

**Example:**

```tsx
const client = useClient();
const userResource = client.go<User>('/api/users/123');
```

### useInfiniteCollection<T extends Entity>(resourceLike: ResourceLike<T>)

Hook for managing infinite scroll/pagination of collection resources.

**Parameters:**

- `resourceLike: ResourceLike<T>` - A resource or resource relation that points to a collection

**Return value:**

```typescript
{
  items: State<ExtractCollectionElement<T>>[];  // Array of collection item states
  loading: boolean;                              // Loading indicator
  hasNextPage: boolean;                          // Whether there's a next page
  error: Error | null;                           // Error object
  loadNextPage: () => void;                      // Function to load next page
}
```

**Features:**

- Automatically fetches the initial page
- Maintains accumulated items across pages
- Follows HAL "next" links for pagination
- Handles loading and error states
- Preserves item relation context when following pagination links

**Important:**

- Do not memoize or store the `loadNextPage` function reference
- Always use the latest `loadNextPage` function returned by the hook

**Example:**

```tsx
const { items, loading, hasNextPage, error, loadNextPage } = useInfiniteCollection(userResource.follow('conversations'));

// Load more items
<button onClick={loadNextPage} disabled={!hasNextPage || loading}>
  {loading ? 'Loading...' : 'Load More'}
</button>;
```

## Advanced Usage

### Custom Hooks for Resource Reading

You can create custom hooks to encapsulate resource reading logic:

```tsx
import { useReadResource } from '@hateoas-ts/resource-react';
import type { User } from './types';

function useUser(userId: string) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const { loading, error, resourceState, resource } = useReadResource(userResource);

  return {
    user: resourceState,
    loading,
    error,
  };
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const { user, loading, error } = useUser(userId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return null;

  return <div>{user.data.name}</div>;
}
```

### Combining Multiple Resources

You can use multiple hooks in a single component to work with different resources:

```tsx
function UserDashboard({ userId }: { userId: string }) {
  const client = useClient();

  const userResource = client.go<User>(`/api/users/${userId}`);
  const { resourceState: user } = useReadResource(userResource);

  const conversations = useInfiniteCollection(userResource.follow('conversations'));

  const accounts = useInfiniteCollection(userResource.follow('accounts'));

  return (
    <div>
      <h1>Welcome {user?.data.name}</h1>

      <section>
        <h2>Conversations</h2>
        {conversations.items.map((conv) => (
          <div key={conv.data.id}>{conv.data.title}</div>
        ))}
      </section>

      <section>
        <h2>Accounts</h2>
        {accounts.items.map((acc) => (
          <div key={acc.data.id}>{acc.data.provider}</div>
        ))}
      </section>
    </div>
  );
}
```

### Error Handling

Handle errors gracefully with try-catch and error states:

```tsx
function UserConversations({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const { items, loading, hasNextPage, error, loadNextPage } = useInfiniteCollection(userResource.follow('conversations'));

  if (error) {
    return (
      <div>
        <h3>Error loading conversations</h3>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  // ... rest of component
}
```

## Testing

Run unit tests using Vitest:

```bash
nx test @hateoas-ts/resource-react
```

## Examples

### Complete Example: User Conversations List

```tsx
import React from 'react';
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider, useInfiniteCollection } from '@hateoas-ts/resource-react';
import type { User, Conversation } from './types';

// Create client
const client = createClient({
  baseURL: 'https://api.example.com',
});

// Conversations component
function ConversationsList({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  const { items, loading, hasNextPage, error, loadNextPage } = useInfiniteCollection(userResource.follow('conversations'));

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      <ul>
        {items.map((conversation) => (
          <li key={conversation.data.id}>{conversation.data.title}</li>
        ))}
      </ul>

      {loading && <div>Loading more conversations...</div>}

      {hasNextPage && !loading && <button onClick={loadNextPage}>Load More</button>}

      {!hasNextPage && items.length > 0 && <div>No more conversations</div>}
    </div>
  );
}

// App component
function App() {
  return (
    <ResourceProvider client={client}>
      <ConversationsList userId="user-123" />
    </ResourceProvider>
  );
}

export default App;
```

## Related Packages

- [`@hateoas-ts/resource`](../resource/README.md) - Core HATEOAS client library
- [`@hateoas-ts/resource-react`] - React integration (this package)

## License

[Add your license information here]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
