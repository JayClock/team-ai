---
name: smart-domain
description: |
  Plans and reviews tasks based on Smart Domain DDD architecture. Use as the entry point for:
  (1) Adding new entities or features requiring multiple layers
  (2) Understanding the overall architecture and workflow
  (3) Reviewing changes across domain, API, and persistence layers

  For layer-specific implementation details, use:
  - smart-domain-layer: Domain entities and Association Objects
  - smart-domain-api: HATEOAS REST APIs with Zero-Copy Wrappers
  - smart-domain-persistence: MyBatis persistence with caching
---

# Smart Domain DDD Architecture

## Overview

Smart Domain DDD solves two traditional DDD problems:

1. **N+1 Query Problem**: Association Objects encapsulate collection access with batch loading
2. **Model Purity vs. Performance**: Wide/narrow interfaces separate internal from external access

```
┌──────────────────────────────────────────────────────────────┐
│                         API Layer                             │
│  UserModel ──────────────────────────────────────────────────│
│    └─ Zero-Copy Wrapper: holds User entity reference         │
│    └─ HATEOAS Links: generated from domain relationships     │
├──────────────────────────────────────────────────────────────┤
│                       Domain Layer                            │
│  User ───────────────────────────────────────────────────────│
│    └─ Entity<String, UserDescription>                        │
│    └─ conversations(): HasMany<String, Conversation>         │
│    └─ User.Conversations: internal write interface           │
├──────────────────────────────────────────────────────────────┤
│                    Persistence Layer                          │
│  UserConversations extends EntityList<String, Conversation>  │
│    └─ implements User.Conversations                          │
│    └─ MyBatis mapper with batch loading                      │
└──────────────────────────────────────────────────────────────┘
```

## Quick Reference

| Task                         | Location                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Domain entities              | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/`                            |
| Descriptions (Value Objects) | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/description/`                      |
| API representations          | `libs/backend/api/src/main/java/reengineering/ddd/teamai/api/representation/`                  |
| API resources                | `libs/backend/api/src/main/java/reengineering/ddd/teamai/api/`                                 |
| Association implementations  | `libs/backend/persistent/mybatis/src/main/java/reengineering/ddd/teamai/mybatis/associations/` |
| MyBatis mappers              | `libs/backend/persistent/mybatis/src/main/java/reengineering/ddd/teamai/mybatis/mappers/`      |
| MyBatis XML                  | `libs/backend/persistent/mybatis/src/main/resources/mybatis.mappers/`                          |

## TDD Workflow

**IMPORTANT**: All implementation follows Test-First approach:

1. **Generate test code first** - Create tests that define expected behavior
2. **Wait for user confirmation** - User reviews and approves the test design
3. **Generate implementation code** - Only after test approval, implement the feature
4. **Verify tests pass** - Run tests to confirm implementation correctness

## Workflow: Adding a New Entity

### Step 1: Domain Layer (use `smart-domain-layer` skill)

1. Create Description record (Value Object)
2. Create Entity with Association Objects
3. Add Association interface to parent entity

### Step 2: Persistence Layer (use `smart-domain-persistence` skill)

4. Create Association implementation extending `EntityList`
5. Create MyBatis Mapper interface
6. Create MyBatis XML mapping

### Step 3: API Layer (use `smart-domain-api` skill)

7. Create HATEOAS Model with Zero-Copy wrapper
8. Create API endpoint with sub-resource pattern

**Each step follows TDD**: test first → confirm → implement → verify

## Key Patterns

### Association Objects (Wide/Narrow Interface)

- **Narrow (read)**: `HasMany<ID, Entity>` - external consumers use this
- **Wide (write)**: `User.Conversations` - internal mutation interface
- **Benefit**: Domain controls all mutations while exposing read-only collection access

### Zero-Copy API Wrappers

API models hold entity references, NOT copies:

```java
public UserModel(User user, UriInfo uriInfo) {
  this.id = user.getIdentity();           // direct reference
  this.description = user.getDescription(); // direct reference
}
```

### Batch Loading with EntityList

`EntityList` provides automatic batch iteration for large collections.

## Anti-Patterns to Avoid

- Never: `user.getConversations()` returning raw `List<Conversation>` (OOM risk)
- Never: Logic in Service layer that belongs to domain
- Never: Bypass domain for direct database access
- Never: Copy data from domain to API (use zero-copy wrappers)

## Related Skills

- **smart-domain-layer**: Domain entities, archetypes, wide/narrow interfaces
- **smart-domain-api**: HATEOAS links, affordances, JAX-RS resources
- **smart-domain-persistence**: EntityList, MyBatis mappers, caching
