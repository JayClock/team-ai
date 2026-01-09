# TEAM AI PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-09
**Updated:** Hybrid Nx + Gradle monorepo (Java 17 + TypeScript)
**Core Architecture:** Smart Domain DDD + HATEOAS RESTful APIs
**Scale:** 203 source files (TS/Java), 12,874 lines of code

## OVERVIEW

Team AI demonstrates Smart Domain DDD architecture solving traditional DDD bottlenecks (N+1 queries, model purity vs. performance) through Association Objects and progressive disclosure HATEOAS APIs.

- **Backend:** Java 17 + Spring Boot 3.5.9 + MyBatis + PostgreSQL + Jersey JAX-RS
- **Frontend:** React 19 + TypeScript + Vite + Ant Design + Tailwind CSS
- **Architecture:** Smart Domain with Association Objects, HATEOAS Level 3, Zero-Copy Wrappers

## STRUCTURE

```
team-ai/
├── apps/                    # Applications
│   ├── server/             # Spring Boot backend (Smart Domain DDD)
│   └── web/                # React frontend (Vite + HATEOAS)
├── libs/                   # Internal libraries
│   ├── backend/             # Java backend modules
│   │   ├── domain/          # Core domain entities & business logic
│   │   ├── api/             # HATEOAS REST API layer (Jersey JAX-RS)
│   │   ├── persistent/       # Database persistence (MyBatis + PostgreSQL)
│   │   └── infrastructure/  # Spring Security, Spring AI
│   └── frontend/            # TypeScript frontend modules
│       ├── features/         # Feature modules (conversations, messages)
│       └── shared/          # Shared UI components and schemas
└── packages/               # Publishable npm packages
    ├── resource/            # HATEOAS TypeScript client library
    └── resource-react/      # React integration hooks
```

## WHERE TO LOOK

| Task                | Location                                                            | Notes                              |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Smart Domain models | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/` | Association Objects pattern        |
| HATEOAS API         | `libs/backend/api/src/main/java/reengineering/ddd/teamai/api/`      | Zero-copy wrappers                 |
| HATEOAS client      | `packages/resource/src/lib/`                                        | Type-safe navigation               |
| React hooks         | `packages/resource-react/src/lib/hooks/`                            | useResource, useInfiniteCollection |
| Server entry        | `apps/server/src/main/java/reengineering/ddd/Application.java`      | Spring Boot bootstrap              |
| Web entry           | `apps/web/src/main.tsx`                                             | React with ResourceProvider        |
| Build config        | `nx.json`, `build.gradle`, `settings.gradle`                        | Hybrid Nx+Gradle                   |
| Feature modules     | `libs/frontend/features/`                                           | Conversation/message features      |
| Shared UI           | `libs/frontend/shared/ui/src/`                                      | Ant Design + Tailwind components   |

## CODE MAP

| Symbol                | Type      | Location                                                                             | Refs | Role                 |
| --------------------- | --------- | ------------------------------------------------------------------------------------ | ---- | -------------------- |
| Application           | Class     | `apps/server/src/main/java/reengineering/ddd/Application.java`                       | High | Spring Boot entry    |
| User                  | Entity    | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/User.java`         | High | Aggregate root       |
| Conversation          | Entity    | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/Conversation.java` | High | Business context     |
| Message               | Entity    | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/Message.java`      | Med  | Conversation content |
| HasMany               | Interface | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/HasMany.java`      | High | Association object   |
| Resource              | Class     | `packages/resource/src/lib/resource/resource.ts`                                     | High | HATEOAS navigation   |
| State                 | Interface | `packages/resource/src/lib/state/state.ts`                                           | High | Resource state       |
| createClient          | Function  | `packages/resource/src/lib/create-client.ts`                                         | Med  | Client factory       |
| ResourceProvider      | Component | `packages/resource-react/src/lib/provider.tsx`                                       | High | React DI context     |
| useClient             | Hook      | `packages/resource-react/src/lib/hooks/use-client.ts`                                | High | Client access        |
| useInfiniteCollection | Hook      | `packages/resource-react/src/lib/hooks/use-infinite-collection.ts`                   | High | Pagination           |

## CONVENTIONS

### Project-Specific (Deviations from Standard)

**Dual Build Systems:**

- Nx (TypeScript) + Gradle (Java) orchestrated via custom configuration
- Custom `settings.gradle` mapping: `project(':backend:domain').projectDir = file('libs/backend/domain')`
- Nx plugins for both languages: `@nx/js/typescript`, `@nx/gradle`
- Tests depend on builds: `"test": { "dependsOn": ["^build"] }`

**Smart Domain DDD Patterns:**

- **Association Objects:** `User.Conversations` instead of `List<Conversation>` (solves N+1)
- **Wide/Narrow Interfaces:** Internal implementation vs. external read-only access
- **Intent-Revealing Methods:** `calculateConsumption()` instead of loops
- **Zero-Copy API:** HATEOAS models hold entity references, not DTO copies

**TypeScript Configuration:**

- **Strict mode** enabled globally (`tsconfig.base.json`)
- **Decorators:** Experimental decorators enabled for DI (`emitDecoratorMetadata: true`)
- **ESLint:** 18 justified violations with inline `// eslint-disable-next-line`
- **No standalone configs:** Vitest uses Nx plugin, not `vitest.config.js`

**Testing:**

- **Vitest** (not Jest) for all TypeScript projects
- **TestContainers:** PostgreSQL containers for integration tests (no H2 mocks)
- **Test organization:** `*.spec.ts` files in `src/tests/` or `src/test/`
- **Mocking:** MSW (Mock Service Worker) for HTTP tests

**Frontend:**

- **Feature modules:** `libs/frontend/features/feature-name/` pattern
- **HATEOAS navigation:** Use `.follow()` semantic links, never hardcode URLs
- **State management:** React Context + Preact Signals (reactive state)
- **UI library:** Ant Design components + Tailwind CSS utilities

**Backend:**

- **Package naming:** `reengineering.ddd.teamai.model` despite project being "team-ai"
- **Repository pattern:** Domain interfaces in `model/`, implementations in `persistent/mybatis`
- **JAX-RS over Spring MVC:** Uses Jersey `@Path` instead of `@RestController`
- **TestContainers:** PostgreSQL containers for integration tests

**Build & CI:**

- **GitHub Actions:** Single job with triple caching (Gradle + Nx + pnpm)
- **No deployment CI:** CI only, no CD pipeline
- **Nx Cloud disabled:** Available but commented out
- **Extended timeouts:** 10-minute Gradle HTTP timeouts configured

## ANTI-PATTERNS (THIS PROJECT)

### Forbidden Patterns

❌ **Anemic Domain Model + Service Scripts**

- Never: `List<Conversation> all = user.getConversations()` (causes OOM)
- Never: Logic in Service layer that belongs to domain
- Always: Encapsulate logic in domain via association objects

❌ **Direct Database Access from UI/API**

- Never: Bypass Smart Domain for database queries
- Always: Go through domain interfaces (`user.conversations()`)

❌ **Hardcoded URL Navigation**

- Never: Manual URL construction (`/api/users/123/conversations`)
- Always: Use HATEOAS `.follow('conversations')` semantic navigation

❌ **DTO Copying Between Layers**

- Never: Copy data from domain to API models
- Always: Zero-copy wrapper pattern (hold entity references)

❌ **Type Error Suppression**

- Never: `as any`, `@ts-ignore`, `@ts-expect-error` except 1 justified `SafeAny` type
- Never: Blanket ESLint disables (all 18 have specific inline justification)
- Always: Follow strict TypeScript mode globally

❌ **Technical Debt Markers**

- Zero TODO/FIXME/HACK comments in production code
- Zero @deprecated annotations
- Zero debugger statements

### Strict Conventions

**TypeScript:**

- No `any` types except in controlled `safe-any.ts` (1 justified violation)
- All non-null assertions have inline justification (12 violations)
- Single quotes enforced by Prettier
- Experimental decorators enabled for Inversify DI

**Nx Monorepo:**

- Tests depend on builds: `"test": {"dependsOn": ["^build"]}`
- No standalone `vitest.config.js` - use Nx plugin instead
- Use `nx run-many -t lint test build` for multi-target execution

**Code Style:**

- 2-space indentation (EditorConfig)
- UTF-8 encoding
- Trim trailing whitespace

**No Critical Technical Debt:**

- Zero TODO/FIXME/HACK comments in production code
- Zero @deprecated annotations
- Zero debugger statements
- No blanket ESLint disables (all 18 have specific justifications)

## UNIQUE STYLES

**Smart Domain Architecture:**

- Association Objects solve N+1 problems while maintaining model purity
- Collective logic encapsulation (e.g., `calculateConsumption(TimeRange)`)
- Isomorphic mapping: Domain entities ↔ REST resources

**HATEOAS-Driven API Design:**

- Progressive disclosure: L1 (discovery) → L2 (decision) → L3 (loading)
- Richardson Maturity Model Level 3: `_links`, `_embedded`, `_templates`
- Auto-generated Agent Skills from HATEOAS links (AI-consumable API)

**Dependency Injection:**

- Inversify container in TypeScript (`packages/resource/src/lib/container.ts`)
- Spring DI in Java
- Singleton-scoped services for testability

**Multi-Language Monorepo:**

- Workspace packages: `pnpm-workspace.yaml` + `nx.json` + Gradle modules
- Cross-language dependency: Java backend depends on TypeScript build artifacts for specs
- Feature modules consume shared packages via workspace aliases (`@shared/schema`)

**Build Orchestration:**

- Nx orchestrates both TypeScript and Java builds via `@nx/gradle` plugin
- Gradle uses `dev.nx.gradle.project-graph` plugin for Nx synchronization
- Custom module mapping: `:backend:domain` → `libs/backend/domain` (flat structure)

## COMMANDS

```bash
# Development
npx nx dev web                    # Start React dev server
npx nx dev server                 # Start Spring Boot backend
npx nx dev                          # Start both

# Building
npx nx build                       # Build all projects
npx nx build web                    # Build web app
npx nx build server                  # Build server (Gradle)
npx nx run-many -t build             # Build all libraries

# Testing
npx nx test                         # Run all tests
npx nx test @hateoas-ts/resource   # Test specific package
npx nx e2e web-e2e                 # Run Playwright E2E tests
npx nx run-many -t lint test build  # Full CI pipeline

# Server (Gradle)
cd apps/server
./gradlew bootRun                  # Run Spring Boot app
./gradlew test                    # Run backend tests
./gradlew build                   # Build backend JAR

# Database
docker-compose up -d postgres     # Start PostgreSQL for development
```

## NOTES

**Gotchas & Onboarding Considerations:**

1. **Dual Build Systems:** Nx (TS) + Gradle (Java) require understanding both. Nx orchestrates Gradle via `@nx/gradle` plugin.

2. **Association Object Pattern:** Not standard DDD. Domain entities expose association interfaces (e.g., `HasMany<String, Conversation>`) instead of collections. Never bypass to access raw data.

3. **HATEOAS Navigation:** Clients use `resource.follow('rel-name')` for semantic navigation, not URL construction. Links are generated dynamically from domain relationships.

4. **Package Naming:** Java packages use `reengineering.ddd.teamai` despite root package being `com.example`. This is intentional per `build.gradle` configuration.

5. **Experimental Decorators:** TypeScript uses `experimentalDecorators: true` for Inversify DI. This is intentional but adds complexity.

6. **Test Organization:** No Jest. Uses Vitest with MSW for HTTP mocking. Tests are in `src/tests/` or `src/test/` directories.

7. **Nx Cloud:** Configured but not enabled. Can enable for distributed builds (requires account).

8. **Caching:** HATEOAS client has ForeverCache and ShortCache. Automatic invalidation on POST/PUT/DELETE methods.

9. **AI Integration:** DeepSeek API for conversation messaging. ModelProvider interface abstracts AI services.

10. **OpenSpec:** Architecture decisions managed via `openspec/` directory. AGENTS.md contains AI assistant guidelines.

**Critical Paths:**

- Smart Domain: `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/`
- Association Objects: `libs/backend/persistent/mybatis/src/main/java/reengineering/ddd/mybatis/associations/`
- HATEOAS Client: `packages/resource/src/lib/resource/resource.ts`
- React Hooks: `packages/resource-react/src/lib/hooks/`
- API Layer: `libs/backend/api/src/main/java/reengineering/ddd/teamai/api/`

**Architecture Readiness:**

- Production-ready HATEOAS implementation
- Comprehensive test coverage (Vitest + Playwright)
- Smart Domain pattern documentation
- Multi-consumer support (Web + AI Agents)
