# @hateoas-ts/resource-react AGENTS.md

**Generated:** 2026-01-06
**Package:** React integration for HATEOAS client library
**Core Architecture:** React hooks + Context for type-safe navigation

## OVERVIEW

React integration layer for @hateoas-ts/resource providing hooks and context provider.

## STRUCTURE

```
packages/resource-react/
├── src/lib/hooks/         # React hooks
│   ├── use-client.ts      # Client instance access
│   ├── use-resource.ts    # Single resource operations
│   ├── use-infinite-collection.ts  # Paginated lists
│   └── use-read-resource.ts # Internal resource reading
├── src/lib/provider.tsx   # ResourceProvider context
├── src/test/hooks/        # Test utilities
└── dist/                  # Build output
```

## WHERE TO LOOK

| Task                | Location                                   | Notes                              |
| ------------------- | ------------------------------------------ | ---------------------------------- |
| ResourceProvider    | `src/lib/provider.tsx`                     | Context for client injection       |
| useClient hook      | `src/lib/hooks/use-client.ts`              | Access client instance             |
| useResource hook    | `src/lib/hooks/use-resource.ts`            | Single resource GET/PUT operations |
| Infinite collection | `src/lib/hooks/use-infinite-collection.ts` | Paginated list handling            |
| Test wrapper        | `src/test/hooks/wrapper.tsx`               | Test utilities with mock client    |

## CONVENTIONS

### React-Specific Patterns

**ResourceProvider Context:**

- Must wrap app tree before using any hooks
- Provides HATEOAS client instance to all descendants
- Single client instance per application

**Hook Usage:**

- useClient() - Access client for manual operations
- useResource() - GET/PUT single resources with loading states
- useInfiniteCollection() - Paginated collections with infinite scroll
- All hooks throw if used outside ResourceProvider

**State Management:**

- Loading boolean during fetch operations
- Error object for failed requests
- resourceState contains full State<T> object
- data property provides typed entity data directly

**Navigation:**

- Use resource.follow('rel-name') for HATEOAS navigation
- Never hardcode URLs
- Type-safe link following through TypeScript generics

## ANTI-PATTERNS (THIS PROJECT)

### Forbidden Patterns

❌ **Direct API Calls Without Hooks**

- Never: Manual fetch/axios calls bypassing HATEOAS client
- Never: Create multiple client instances in components
- Always: Use hooks for all resource operations

❌ **Bypassing ResourceProvider**

- Never: use hooks without ResourceProvider wrapper
- Never: Pass client as prop to components
- Always: Access client via useClient() hook

❌ **Storing loadNextPage Reference**

- Never: memoize or store loadNextPage function
- Never: use stale loadNextPage references
- Always: use latest loadNextPage from hook return

❌ **Hardcoded URL Construction**

- Never: Manual URL building (`/api/users/123/conversations`)
- Always: Use semantic navigation (`resource.follow('conversations')`)

### Strict Conventions

**Testing:**

- Use wrapper component from `src/test/hooks/wrapper.tsx`
- Mock client with vi.fn() for testing
- React Testing Library for component tests

**Error Handling:**

- Check error property before accessing data
- Handle loading states appropriately
- Never assume resource exists

**TypeScript:**

- Always specify Entity types in hooks: `useResource<User>(resource)`
- Use ResourceLike type for flexible resource passing
- Leverage ExtractCollectionElement for collection item types
