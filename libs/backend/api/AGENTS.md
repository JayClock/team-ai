# TEAM AI API MODULE

**Generated:** 2026-01-09
**Module:** HATEOAS REST API Layer (Jersey JAX-RS + HAL)

## OVERVIEW

HATEOAS REST API layer using Jersey JAX-RS with zero-copy wrappers and Spring HATEOAS HAL configuration.

## STRUCTURE

```
libs/backend/api/src/main/java/reengineering/ddd/teamai/api/
├── representation/          # Zero-copy resource models
├── ApiTemplates.java       # UriTemplate builders (no hardcoded URLs)
├── Pagination.java         # PagedModel with HAL metadata
├── *Api.java              # JAX-RS resources (@Path, not @RestController)
└── config/HAL.java         # Jackson2HalModule registration
```

## WHERE TO LOOK

| Task            | Location                     | Notes                                      |
| --------------- | ---------------------------- | ------------------------------------------ |
| Resource models | `representation/*Model.java` | Zero-copy wrappers, entity references only |
| Link generation | `ApiTemplates.java`          | UriTemplate.build() semantic URLs          |
| REST endpoints  | `*Api.java`                  | Jersey @Path, @GET, @PathParam             |
| HAL config      | `config/HAL.java`            | Jackson2HalModule registration             |
| Affordances     | `UserModel.java` constructor | `.afford(HttpMethod.*)` HTTP hints         |

## CONVENTIONS

### Zero-Copy Wrapper Pattern

Resource models extend `RepresentationModel<T>`, hold entity references (no DTO copying). Generate dynamic links from domain relationships via `ApiTemplates`. Declare HTTP methods via `Affordances.of(link).afford(HttpMethod.*)`.

### Jersey JAX-RS (Not Spring MVC)

Use JAX-RS `@Path`, `@GET`, `@POST`, `@PathParam` (never `@RestController`). Use `@Inject` from `jakarta.inject` (never `@Autowired`). Sub-resources delegate via `ResourceContext.initResource()`.

### HAL + Affordances

Register `Jackson2HalModule` + `Jackson2HalFormsModule` in `config/HAL.java`. Affordance: `Affordances.of(link).afford(HttpMethod.POST).withInput(Class)`. Use `@Relation(collectionRelation = "conversations")` for collections.

### Link Generation (No Hardcoded URLs)

```java
ApiTemplates.user(uriInfo).build(userId)           // /users/{id}
ApiTemplates.conversations(uriInfo).build(userId)   // /users/{id}/conversations
ApiTemplates.messages(uriInfo).build(userId, convId) // /users/{id}/conversations/{id}/messages
```

## ANTI-PATTERNS (FORBIDDEN)

❌ **DTO Copying Between Layers**

- Never: Copy entity data to DTO objects
- Always: Use zero-copy wrapper pattern (hold entity references)

❌ **Hardcoded URL Construction**

- Never: Manual URL building (`"/users/" + id`)
- Always: Use `ApiTemplates` for semantic link generation

❌ **Spring MVC Controllers**

- Never: Use `@RestController`, `@GetMapping`, `@RequestMapping`
- Always: Use Jersey JAX-RS: `@Path`, `@GET`, `@PathParam`, `@POST`

❌ **Missing Affordances**

- Never: Return plain `_links` without HTTP method hints
- Always: Declare available operations via `.afford(HttpMethod.*)`

❌ **Bypassing Domain Relationships**

- Never: Generate links unrelated to domain model structure
- Always: Links must map 1:1 to domain associations
