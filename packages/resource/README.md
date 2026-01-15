# @hateoas-ts/resource

[![npm version](https://img.shields.io/npm/v/@hateoas-ts/resource?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource)
[![npm downloads](https://img.shields.io/npm/dm/@hateoas-ts/resource?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@hateoas-ts/resource?style=flat-square)](https://bundlephobia.com/package/@hateoas-ts/resource)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@hateoas-ts/resource?style=flat-square)](./LICENSE)

> Type-safe HATEOAS client for HAL APIs with automatic link navigation, caching, and middleware support.

**Language**: [English](./README.md) | [中文](./README_ZH.md)

## Installation

```bash
npm install @hateoas-ts/resource
# or
yarn add @hateoas-ts/resource
# or
pnpm add @hateoas-ts/resource
```

## Quick Start

```typescript
import { createClient, Entity, Collection } from '@hateoas-ts/resource';

// 1. Define your entity types
type Post = Entity<{ id: string; title: string; content: string }, { self: Post; author: User }>;

type User = Entity<{ id: string; name: string; email: string }, { self: User; posts: Collection<Post> }>;

// 2. Create client
const client = createClient({ baseURL: 'https://api.example.com' });

// 3. Navigate resources
const user = await client.go<User>('/users/123').get();
console.log(user.data.name);

// 4. Follow HATEOAS links - no URL hardcoding!
const posts = await user.follow('posts').get();
for (const post of posts.collection) {
  console.log(post.data.title);
}
```

## Core Concepts

| Concept        | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| **Entity**     | Type-safe resource definition with data, links, and actions |
| **Collection** | Paginated list of entities with navigation links            |
| **Resource**   | Represents an API endpoint with HTTP methods                |
| **State**      | Contains resource data, links, and collection items         |
| **Middleware** | Intercept and modify requests/responses                     |

## API Methods

### Read Operations

```typescript
// GET request (cached automatically)
const user = await client.go<User>('/users/123').get();

// Access data
console.log(user.data.name);
console.log(user.data.email);
```

### Navigation

```typescript
// Follow a link to related resource
const posts = await user.follow('posts').get();

// Follow with URI template parameters
const filtered = await user.follow('posts', { page: 2, size: 10 }).get();

// Chain navigation
const author = await posts.collection[0].follow('author').get();
```

### Write Operations

```typescript
// POST - Create new resource
const newPost = await user.follow('posts').post({
  data: { title: 'Hello World', content: 'My first post' },
});

// PUT - Full update
await post.put({
  data: { title: 'Updated Title', content: 'Updated content' },
});

// PATCH - Partial update
await post.patch({
  data: { title: 'New Title' },
});

// DELETE
await post.delete();
```

### Middleware

```typescript
// Add authentication
client.use(async (request, next) => {
  request.headers.set('Authorization', `Bearer ${token}`);
  return next(request);
});

// Add logging for specific origin
client.use(async (request, next) => {
  console.log('Request:', request.url);
  const response = await next(request);
  console.log('Response:', response.status);
  return response;
}, 'https://api.example.com');
```

### Caching

```typescript
// GET requests are cached automatically
const user1 = await client.go<User>('/users/123').get();
const user2 = await client.go<User>('/users/123').get(); // From cache

// Manual cache operations
resource.clearCache();
const cached = resource.getCache();
resource.updateCache(newState);
```

### Events

```typescript
const resource = client.go<User>('/users/123');

// Listen for updates
resource.on('update', (state) => {
  console.log('Resource updated:', state.data);
});

// Listen for stale events (after POST/PUT/PATCH/DELETE)
resource.on('stale', () => {
  console.log('Cache is stale, refetch recommended');
});

// Listen for delete
resource.on('delete', () => {
  console.log('Resource was deleted');
});
```

### Collections

```typescript
const postsState = await user.follow('posts').get();

// Pagination metadata
console.log(`Page ${postsState.data.page.number + 1} of ${postsState.data.page.totalPages}`);
console.log(`Total: ${postsState.data.page.totalElements} items`);

// Iterate items
for (const post of postsState.collection) {
  console.log(post.data.title);
}

// Navigate pages
const nextPage = await postsState.follow('next').get();
const prevPage = await postsState.follow('prev').get();
```

## Type Definitions

### Entity

```typescript
import { Entity } from '@hateoas-ts/resource';

// Entity<TData, TLinks, TActions>
type User = Entity<
  // TData - resource properties
  { id: string; name: string; email: string },
  // TLinks - available navigation links
  {
    self: User;
    posts: Collection<Post>;
    'create-post': Post;
  },
  // TActions - HAL-Forms actions (optional)
  {
    'create-post': Post;
  }
>;
```

### Collection

```typescript
import { Collection } from '@hateoas-ts/resource';

// Collection automatically includes:
// - page: { size, totalElements, totalPages, number }
// - links: { first, prev, self, next, last }
type Posts = Collection<Post>;
```

## API Reference

📚 **[Full API Documentation](https://jayclock.github.io/team-ai/packages/resource/)**

### Key Exports

| Export             | Type     | Description                             |
| ------------------ | -------- | --------------------------------------- |
| `createClient`     | Function | Create a HATEOAS client instance        |
| `Entity`           | Type     | Define entity types with data and links |
| `Collection`       | Type     | Define paginated collection types       |
| `Resource`         | Class    | Resource navigation and HTTP methods    |
| `ResourceRelation` | Class    | Relationship navigation                 |
| `State`            | Type     | Resource state with data and links      |
| `FetchMiddleware`  | Type     | Request/response middleware type        |

## React Integration

See [@hateoas-ts/resource-react](../resource-react/README.md) for React hooks:

```typescript
import { useResource, useInfiniteCollection } from '@hateoas-ts/resource-react';

function UserProfile({ userId }) {
  const { data, loading, error } = useResource<User>(`/users/${userId}`);

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return <div>{data.name}</div>;
}
```

## Related Documentation

- [Smart Domain DDD Architecture](../../libs/backend/README.md) - Backend architecture design
- [REST Principles and Agentic UI](../../public/REST_Principles_Agentic_UI.pdf) - REST architecture principles

## Changelog

### Version 1.4.0 (Current)

- Direct HTTP methods: `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`
- Request deduplication for concurrent requests
- Improved TypeScript generics

### Version 1.3.0

- React integration utilities (`@hateoas-ts/resource-react`)
- Enhanced caching strategies

### Version 1.2.0

- Basic HAL resource navigation
- Type-safe entity definitions
- Cache management
- Event system
- Middleware support

## License

MIT
