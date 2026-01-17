# @hateoas-ts/resource-react

[![npm version](https://img.shields.io/npm/v/@hateoas-ts/resource-react?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource-react)
[![npm downloads](https://img.shields.io/npm/dm/@hateoas-ts/resource-react?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource-react)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61dafb?style=flat-square)](https://react.dev/)
[![License](https://img.shields.io/npm/l/@hateoas-ts/resource-react?style=flat-square)](./LICENSE)

> React hooks for type-safe HATEOAS API navigation. Built on top of [`@hateoas-ts/resource`](https://www.npmjs.com/package/@hateoas-ts/resource).

## Installation

```bash
npm install @hateoas-ts/resource-react @hateoas-ts/resource
```

## Quick Start

```tsx
import { createClient } from '@hateoas-ts/resource';
import { ResourceProvider, useClient, useResource } from '@hateoas-ts/resource-react';

// Set up provider
const client = createClient({ baseURL: 'https://api.example.com' });

function App() {
  return (
    <ResourceProvider client={client}>
      <UserProfile userId="123" />
    </ResourceProvider>
  );
}

// Use hooks
function UserProfile({ userId }: { userId: string }) {
  const client = useClient();
  const { loading, error, data } = useResource(client.go<User>(`/api/users/${userId}`));

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>Welcome, {data.name}!</div>;
}
```

## Documentation

For complete API reference and usage examples, visit the **[Full Documentation](https://jayclock.github.io/team-ai/resource-react/)**.

## Related

- [`@hateoas-ts/resource`](https://www.npmjs.com/package/@hateoas-ts/resource) - Core HATEOAS client

## License

MIT
