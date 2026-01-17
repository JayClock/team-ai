# @hateoas-ts/resource

[![npm version](https://img.shields.io/npm/v/@hateoas-ts/resource?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource)
[![npm downloads](https://img.shields.io/npm/dm/@hateoas-ts/resource?style=flat-square)](https://www.npmjs.com/package/@hateoas-ts/resource)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@hateoas-ts/resource?style=flat-square)](https://bundlephobia.com/package/@hateoas-ts/resource)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@hateoas-ts/resource?style=flat-square)](./LICENSE)

> Type-safe HATEOAS client for HAL APIs with automatic link navigation, caching, and middleware support.

## Installation

```bash
npm install @hateoas-ts/resource
```

## Quick Start

```typescript
import { createClient, Entity, Collection } from '@hateoas-ts/resource';

// Define your entity types
type User = Entity<{ id: string; name: string }, { self: User; posts: Collection<Post> }>;

// Create client and navigate resources
const client = createClient({ baseURL: 'https://api.example.com' });
const user = await client.go<User>('/users/123').get();

// Follow HATEOAS links - no URL hardcoding!
const posts = await user.follow('posts').get();
```

## Documentation

For complete API reference and usage examples, visit the **[Full Documentation](https://jayclock.github.io/team-ai/resource/)**.

## React Integration

See [@hateoas-ts/resource-react](../resource-react/README.md) for React hooks integration.

## Related Documentation

- [Smart Domain DDD Architecture](https://github.com/jayclock/team-ai/blob/main/libs/backend/README.md) - Backend architecture design
- [REST Principles and Agentic UI](https://github.com/jayclock/team-ai/blob/main/public/REST_Principles_Agentic_UI.pdf) - REST architecture principles

## License

MIT
