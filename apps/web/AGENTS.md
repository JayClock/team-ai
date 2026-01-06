# WEB APPLICATION KNOWLEDGE BASE

**Generated:** 2026-01-06
**Framework:** React 19 + TypeScript + Vite
**Core:** HATEOAS client integration with Ant Design + Tailwind

## OVERVIEW

React 19 application implementing HATEOAS navigation patterns with Ant Design UI components and Tailwind CSS styling.

## STRUCTURE

```
apps/web/src/
├── app/App.tsx              # Main routing structure
├── lib/api-client.ts        # HATEOAS client configuration
├── routes/AppRoutes.tsx     # Route definitions + feature mapping
├── features/                # Feature modules
│   ├── auth/               # Authentication (Login, ProtectedRoute)
│   ├── layout/             # AppLayout component
│   └── user-conversations/ # Conversation feature
├── config/app.config.ts    # Application configuration
└── main.tsx               # Entry point (ResourceProvider + XProvider)
```

## WHERE TO LOOK

| Task              | Location                            | Notes                            |
| ----------------- | ----------------------------------- | -------------------------------- |
| App entry         | `src/main.tsx`                      | ResourceProvider + BrowserRouter |
| HATEOAS client    | `src/lib/api-client.ts`             | Auth middleware + credentials    |
| Routing logic     | `src/routes/AppRoutes.tsx`          | Feature module consumption       |
| Layout structure  | `src/features/layout/AppLayout.tsx` | Ant Design Layout + Tailwind     |
| App configuration | `src/config/app.config.ts`          | API base URL + auth paths        |

## CONVENTIONS

### Project-Specific Patterns

**Application Setup:**

- **Entry Point:** `main.tsx` wraps app with `XProvider` → `ResourceProvider` → `BrowserRouter`
- **HATEOAS Client:** Uses `@hateoas-ts/resource` with auth/credentials middleware
- **Vite Proxy:** `/api` routes proxy to `http://localhost:8080` (backend)

**Routing Structure:**

- **Protected Routes:** All routes except `/login` wrapped in `ProtectedRoute`
- **Layout Pattern:** `AppLayout` accepts `headerContent`, `rightContent`, and children
- **Feature Mapping:** `AppRoutes` orchestrates feature components via HATEOAS navigation

**Component Usage:**

- **Ant Design:** Primary UI component library (Layout, Menu, etc.)
- **Tailwind CSS:** Utility-first styling for layout and spacing
- **Feature Modules:** Consume `@features/*` packages for business logic

**HATEOAS Integration:**

- **Resource Provider:** Global context for HATEOAS client
- **Navigation:** Use `resource.follow('rel-name')` for semantic navigation
- **State Management:** React hooks (`useResource`) for HATEOAS resources

## ANTI-PATTERNS (FORBIDDEN)

### Forbidden Practices

❌ **Direct API Calls Without HATEOAS**

- Never: Use `fetch` or `axios` directly for API calls
- Always: Use HATEOAS client with `resource.follow()` semantic navigation

❌ **Hardcoded URL Navigation**

- Never: Manual URL construction (`/api/users/123/conversations`)
- Always: Use HATEOAS semantic links from resources

❌ **Bypassing Resource Provider**

- Never: Create HATEOAS clients outside provider context
- Always: Use global `apiClient` from `lib/api-client.ts`

❌ **Mixing Styling Approaches**

- Never: Mix inline styles with Tailwind utilities
- Always: Use Tailwind classes, Ant Design components for structured UI

### Strict Conventions

**File Organization:**

- Feature modules in `src/features/feature-name/` pattern
- Shared configuration in `src/config/`
- Core setup (`main.tsx`, `App.tsx`) at `src/` root

**Component Patterns:**

- Use TypeScript interfaces for props
- Follow Ant Design theming conventions
- Apply Tailwind utility classes consistently

**HATEOAS Usage:**

- Always use `useResource` hook for resource state
- Handle loading/error states from HATEOAS client
- Follow semantic navigation patterns

## KEY FILES

- `src/main.tsx` - Application bootstrap with providers
- `src/lib/api-client.ts` - HATEOAS client configuration with middleware
- `src/routes/AppRoutes.tsx` - Route-to-feature mapping and layout
- `src/features/layout/AppLayout.tsx` - Main layout structure
- `vite.config.ts` - Development proxy to backend server
