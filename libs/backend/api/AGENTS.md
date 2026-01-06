# TEAM AI API MODULE

**Generated:** 2026-01-06
**Module:** HATEOAS REST API Layer (Java Spring Boot)

## OVERVIEW

HATEOAS REST API layer implementing zero-copy wrapper pattern with Richardson Maturity Level 3 compliance.

## STRUCTURE

```
libs/backend/api/src/main/java/reengineering/ddd/teamai/api/
├── representation/          # HATEOAS resource models (zero-copy wrappers)
│   ├── UserModel.java      # User resource with dynamic links
│   ├── ConversationModel.java
│   ├── MessageModel.java
│   └── AccountModel.java
├── ApiTemplates.java       # URI template builders for link generation
├── Pagination.java         # Collection pagination with HAL support
├── *Api.java              # REST controllers (UsersApi, UserApi, ConversationsApi)
└── RootApi.java           # API entry point with auth context
```

## WHERE TO LOOK

| Task             | Location                     | Notes                                          |
| ---------------- | ---------------------------- | ---------------------------------------------- |
| Resource models  | `representation/*Model.java` | Zero-copy wrappers, extend RepresentationModel |
| Link generation  | `ApiTemplates.java`          | UriTemplate builders for HATEOAS links         |
| REST controllers | `*Api.java`                  | JAX-RS resources with HAL responses            |
| Pagination       | `Pagination.java`            | CollectionModel with \_links metadata          |

## CONVENTIONS

### Zero-Copy Wrapper Pattern

- **Resource Models**: Extend `RepresentationModel<T>`, hold entity references (no DTO copying)
- **Dynamic Links**: Generate from domain relationships via `ApiTemplates`
- **Affordances**: HTTP method declarations via `Affordances.of(link).afford(HttpMethod.*)`

### HATEOAS Response Structure

- **\_links**: Self-rel + navigation rels (accounts, conversations, messages)
- **\_embedded**: Collections use `CollectionModel<T>` with pagination metadata
- **Templates**: Create operations expose input types via `.withInput(RequestBody.class)`

### Link Generation

```java
// Template-based link building
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

❌ **Missing Affordances**

- Never: Return plain `_links` without HTTP method hints
- Always: Declare available operations via `.afford(HttpMethod.*)`

❌ **Bypassing Domain Relationships**

- Never: Generate links unrelated to domain model structure
- Always: Links must map 1:1 to domain associations (`user.conversations()` → `rel="conversations"`)

### Resource Model Naming

- Entity → Resource: `User` → `UserModel`, `Conversation` → `ConversationModel`
- Collection Relations: Use `@Relation(collectionRelation = "conversations")`
- JSON Properties: `@JsonProperty("id")` for identity, `@JsonUnwrapped` for descriptions

### Controller Patterns

- **Sub-resource delegation**: `@Path("accounts") public AccountsApi accounts()`
- **Caching**: `@Cacheable(value = "users", key = "#root.target.user.getIdentity()")`
- **Error handling**: `orElseThrow(() -> new WebApplicationException(NOT_FOUND))`
