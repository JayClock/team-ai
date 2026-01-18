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
│   └── project-conversations/ # Conversation feature
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

**Application Bootstrap:** `main.tsx` wraps app with `XProvider` → `ResourceProvider` → `BrowserRouter`

**HATEOAS Client:** Configured with auth middleware and credentials in `lib/api-client.ts`

**Vite Proxy:** `/api` routes proxy to `http://localhost:8080` (backend server)

**Feature Consumption:** Routes map to feature modules in `libs/frontend/features/` via HATEOAS navigation

## ANTI-PATTERNS (FORBIDDEN)

❌ **Direct API Calls:** Never use `fetch` or `axios` directly - always use HATEOAS client

❌ **Hardcoded URLs:** Never construct URLs manually - always navigate via `resource.follow('rel-name')`

❌ **Bypassing ResourceProvider:** Never create HATEOAS clients outside provider context

❌ **Mixed Styling:** Never mix inline styles with Tailwind utilities
