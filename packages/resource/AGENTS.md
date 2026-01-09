# RESOURCE HATEOAS CLIENT LIBRARY

## OVERVIEW

TypeScript HATEOAS client with type-safe navigation, state management, and caching.

## STRUCTURE

```
packages/resource/src/lib/
├── resource/           # Resource class (EventEmitter-based navigation)
├── state/             # State factories (HAL, Binary, Stream)
├── http/              # HTTP fetcher with middleware pipeline
├── cache/             # Cache abstractions (Forever, Short)
├── middlewares/        # Built-in middleware (cache, auth, logging)
├── links/             # Link resolution and template expansion
├── archtype/          # Type definitions and DI tokens
└── container.ts       # Inversify dependency injection
```

## WHERE TO LOOK

- Resource class: `src/lib/resource/resource.ts`
- State interface: `src/lib/state/state.ts`
- HTTP fetcher: `src/lib/http/fetcher.ts`
- Cache implementations: `src/lib/cache/forever-cache.ts`, `short-cache.ts`
- DI container: `src/lib/container.ts`
- Client factory: `src/lib/create-client.ts`

## CONVENTIONS

- **Resource Navigation**: Use `follow('rel-name')` for semantic navigation, never hardcoded URLs
- **State Factories**: HAL (JSON), Binary (blobs), Stream (response.body) - auto-selected by Content-Type
- **State Management**: State objects are immutable - use `clone()` for modifications
- **Cache Strategy**: Default ForeverCache for static data, ShortCache (30s TTL) for dynamic data
- **Middleware Pipeline**: Use `client.use(middleware, origin)` for cross-cutting concerns (auth, logging)
- **Event-Driven**: Resource extends EventEmitter - listen to 'update' (state change), 'stale' (cache invalidation), 'delete' events
- **Dependency Injection**: Inversify container with singleton-scoped services
- **Type Safety**: Entity types define data shape and link relationships at compile time

## ANTI-PATTERNS

❌ **Hardcoded URL construction** - Never build URLs manually, always use `follow()` semantic navigation
❌ **Bypassing cache middleware** - Always go through fetcher, never call fetch() directly
❌ **Direct state mutation** - Never modify state.data directly, use `updateCache()` or create new state
❌ **Cache key assumptions** - Never assume cache keys, always use resource URI
❌ **Missing middleware chaining** - Always call `next(request)` in custom middleware
❌ **Blocking cache destruction** - Always call `cache.destroy()` on application shutdown
