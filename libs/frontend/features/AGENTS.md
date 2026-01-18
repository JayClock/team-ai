# FRONTEND FEATURE MODULES

**Generated:** 2026-01-09
**Workspace:** Nx monorepo feature modules (React + TypeScript)
**Core:** Feature-based architecture consuming shared packages

## OVERVIEW

Frontend feature modules implementing business logic using @shared packages for UI components and schema definitions.

## STRUCTURE

```
libs/frontend/features/
├── conversation-messages/     # Message list and input feature
├── project-conversations/        # User conversation list feature
└── [feature-name]/
    ├── src/components/         # Feature-specific components
    ├── src/lib/              # Feature business logic
    ├── package.json
    └── AGENTS.md
```

## WHERE TO LOOK

| Task                   | Location                       | Notes                          |
| ---------------------- | ------------------------------ | ------------------------------ |
| Feature components     | `feature-name/src/components/` | Feature-specific UI logic      |
| Feature business logic | `feature-name/src/lib/`        | Domain logic, state management |
| Shared UI components   | Import from `@shared/ui/*`     | Button, Input, etc.            |
| Shared schemas         | Import from `@shared/schema/*` | Type definitions               |
| Feature exports        | `src/index.ts` (if present)    | Public API for feature module  |

## CONVENTIONS

### Feature Module Structure

**Imports:** UI components from `@shared/ui`, Schemas from `@shared/schema`, HATEOAS client from `useClient()`

**Component Organization:** Feature-specific components in local `src/components/`, reuse shared UI from `@shared/ui`

**State Management:** `useInfiniteCollection()` for paginated lists, `useResource()` for single resources, all via ResourceProvider

**HATEOAS Navigation:** Never hardcode URLs, always use `resource.follow('rel-name')`, get initial resource from parent route

**Code Style:** Follow Ant Design patterns, use Tailwind utilities, TypeScript strict mode

## ANTI-PATTERNS (FORBIDDEN)

❌ **Direct API Calls** - Never use `fetch`/`axios` directly, always use HATEOAS client

❌ **Hardcoded URLs** - Never construct URLs manually, always use HATEOAS semantic navigation

❌ **Duplicated UI Components** - Never copy common UI to feature directory, always import from `@shared/ui/*`

❌ **Feature Bypassing Shared Schemas** - Never define types that exist in `@shared/schema`, always import from shared packages

## INTEGRATION POINTS

Feature modules consumed by `apps/web` via route mapping: imports from `libs/frontend/features/feature-name`, maps to route paths, provides layout via AppLayout
