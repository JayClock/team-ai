# @hateoas-ts/resource-react

[![npm version](https://img.shields.io/npm/v/@hateoas-ts/resource-react.svg)](https://www.npmjs.com/package/@hateoas-ts/resource-react)
[![npm downloads](https://img.shields.io/npm/dm/@hateoas-ts/resource-react.svg)](https://www.npmjs.com/package/@hateoas-ts/resource-react)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61dafb.svg)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Language**: [English](./README.md) | [中文](./README_zh.md)

React hooks for type-safe HATEOAS API navigation. Built on top of [`@hateoas-ts/resource`](https://www.npmjs.com/package/@hateoas-ts/resource).

## Installation

```bash
npm install @hateoas-ts/resource-react @hateoas-ts/resource
```

## Quick Start

### 1. Set Up Provider

```tsx
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider } from '@hateoas-ts/resource-react';

const client = createClient({ baseURL: 'https://api.example.com' });

function App() {
  return (
    <ResourceProvider client={client}>
      <YourApp />
    </ResourceProvider>
  );
}
```

### 2. Define Entity Types

```typescript
import { Entity, Collection } from '@hateoas-ts/resource';

export type User = Entity<{ id: string; name: string; email: string }, { self: User; conversations: Collection<Conversation> }>;

export type Conversation = Entity<{ id: string; title: string }, { self: Conversation }>;
```

### 3. Use Hooks

```tsx
import { useResource, useInfiniteCollection, useClient } from '@hateoas-ts/resource-react';

function UserProfile({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  // Fetch single resource
  const { loading, error, data } = useResource(userResource);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>Welcome, {data.name}!</div>;
}

function ConversationList({ userId }: { userId: string }) {
  const client = useClient();
  const userResource = client.go<User>(`/api/users/${userId}`);

  // Fetch paginated collection with infinite scroll
  const { items, loading, hasNextPage, loadNextPage } = useInfiniteCollection(userResource.follow('conversations'));

  return (
    <div>
      {items.map((item) => (
        <div key={item.data.id}>{item.data.title}</div>
      ))}
      {hasNextPage && (
        <button onClick={loadNextPage} disabled={loading}>
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

## API Reference

### Provider

| Export             | Description                         |
| ------------------ | ----------------------------------- |
| `ResourceProvider` | Context provider for HATEOAS client |

### Hooks

| Hook                              | Description                                     |
| --------------------------------- | ----------------------------------------------- |
| `useClient()`                     | Access the client instance                      |
| `useResource(resource)`           | Fetch a single resource                         |
| `useInfiniteCollection(resource)` | Fetch paginated collection with infinite scroll |

### React 19 Suspense Hooks

| Hook                                      | Description                            |
| ----------------------------------------- | -------------------------------------- |
| `useSuspenseResource(resource)`           | Suspense-enabled single resource fetch |
| `useSuspenseInfiniteCollection(resource)` | Suspense-enabled infinite scroll       |

### Suspense Example (React 19+)

```tsx
import { Suspense } from 'react';
import { useSuspenseResource, useClient } from '@hateoas-ts/resource-react';

function UserProfile({ userId }: { userId: string }) {
  const client = useClient();
  const { data } = useSuspenseResource(client.go<User>(`/api/users/${userId}`));

  // No loading check - suspends until ready
  return <div>Welcome, {data.name}!</div>;
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile userId="123" />
    </Suspense>
  );
}
```

## Return Types

### `useResource` / `useSuspenseResource`

```typescript
{
  loading: boolean; // Loading state (useResource only)
  error: Error | null; // Error if request failed
  data: T['data']; // Entity data
  resourceState: State<T>; // Full state with links
  resource: Resource<T>; // Resource for further navigation
}
```

### `useInfiniteCollection` / `useSuspenseInfiniteCollection`

```typescript
{
  items: State<Element>[];    // Accumulated collection items
  loading: boolean;           // Loading state (non-suspense only)
  isLoadingMore: boolean;     // Loading more pages (suspense only)
  hasNextPage: boolean;       // More pages available
  error: Error | null;        // Error if request failed
  loadNextPage: () => void;   // Load next page
}
```

## Related

- [`@hateoas-ts/resource`](https://www.npmjs.com/package/@hateoas-ts/resource) - Core HATEOAS client

## License

MIT
