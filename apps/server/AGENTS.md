# TEAM AI SERVER KNOWLEDGE BASE

**Generated:** 2026-01-09
**Workspace:** Spring Boot 3.4.8 (Java 17)
**Core Architecture:** Smart Domain DDD + HATEOAS + Jersey JAX-RS

## OVERVIEW

Spring Boot application implementing Smart Domain DDD backend with HATEOAS REST API, MyBatis persistence, and OAuth2 security.

## STRUCTURE

```
apps/server/
├── src/main/java/reengineering/ddd/
│   ├── Application.java              # @SpringBootApplication bootstrap
│   ├── config/                       # Spring configuration classes
│   │   ├── Jersey.java               # JAX-RS + HAL configuration
│   │   ├── HAL.java                  # Jackson HAL module setup
│   │   └── MyBatis.java              # MyBatis component scanning
│   └── infrastructure/               # Security, AI services
└── src/main/resources/
    ├── application.yml                # Spring configuration
    └── application-*.yml             # Environment profiles
```

## WHERE TO LOOK

| Task              | Location                                                       | Notes                                      |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------ |
| Application entry | `Application.java`                                             | @SpringBootApplication + @EnableCaching    |
| JAX-RS endpoints  | `libs/backend/api/src/main/java/reengineering/ddd/teamai/api/` | Jersey resources with @Path                |
| Spring config     | `application.yml`                                              | HAL, Jersey, MyBatis, OAuth2               |
| Domain services   | `libs/backend/domain/`                                         | Smart Domain entities, Association Objects |
| Database config   | MyBatis mapper scanning via `@ComponentScan` in `MyBatis.java` | PostgreSQL + Flyway migrations             |
| Security setup    | `libs/backend/infrastructure/`                                 | OAuth2 GitHub provider                     |

## CONVENTIONS

### Spring Boot Integration

- **Custom scanning:** `scanBasePackageClasses` includes SecurityConfig and OAuth2UserService
- **JAX-RS over MVC:** Jersey with Spring DI, not Spring MVC controllers
- **HAL configuration:** Jackson2HalModule + Jackson2HalFormsModule auto-registered
- **Resource registration:** API classes registered in Jersey constructor

### Domain Integration

- **Zero-copy wrappers:** HATEOAS ResourceModels hold entity references, not DTO copies
- **Association Objects:** Domain services expose HasMany interfaces, not collections
- **Service injection:** Domain services injected via Spring DI into Jersey resources

### Configuration Patterns

- **Multi-environment:** application.yml + application-{env}.yml profiles
- **Caffeine caching:** 1000 entries, 10-minute expiration
- **ETag filtering:** ShallowEtagHeaderFilter excludes SSE endpoints

## ANTI-PATTERNS (FORBIDDEN)

❌ **Direct Database Access Bypassing Domain**

- Never: Use MyBatis mappers directly in Jersey resources
- Never: Bypass domain services for database queries
- Always: Go through domain interfaces (`users.conversations()`)

❌ **DTO Copying Between Layers**

- Never: Copy data from domain entities to API models
- Always: Zero-copy wrapper pattern (hold entity references)

❌ **Spring MVC Controllers**

- Never: Use @RestController or @RequestMapping
- Always: Use JAX-RS annotations (@Path, @GET, @POST)

❌ **Hardcoded URL Construction**

- Never: Manual URL construction in frontend clients
- Always: Use HATEOAS `_links` for semantic navigation
