# @hateoas-ts/resource-react AGENTS.md

**Generated:** 2026-01-09
**Package:** React integration for HATEOAS client library
**Core Architecture:** React hooks + Context for type-safe navigation

## OVERVIEW

React integration layer for @hateoas-ts/resource providing hooks and context provider.

## WHERE TO LOOK

| Task                | Location                                   | Notes                              |
| ------------------- | ------------------------------------------ | ---------------------------------- |
| ResourceProvider    | `src/lib/provider.tsx`                     | Context for client injection       |
| useClient hook      | `src/lib/hooks/use-client.ts`              | Access client instance             |
| useResource hook    | `src/lib/hooks/use-resource.ts`            | Single resource GET/PUT operations |
| Infinite collection | `src/lib/hooks/use-infinite-collection.ts` | Paginated list handling            |
| Test wrapper        | `src/test/hooks/wrapper.tsx`               | Test utilities with mock client    |

## ANTI-PATTERNS (THIS PROJECT)

### Forbidden Patterns

❌ **Bypassing ResourceProvider**

- Never: use hooks without ResourceProvider wrapper
- Never: Pass client as prop to components
- Always: Access client via useClient() hook

❌ **Direct API Calls Without Hooks**

- Never: Manual fetch/axios calls bypassing HATEOAS client
- Never: Create multiple client instances in components
- Always: Use hooks for all resource operations

❌ **Storing loadNextPage Reference**

- Never: memoize or store loadNextPage function
- Never: use stale loadNextPage references
- Always: use latest loadNextPage from hook return
