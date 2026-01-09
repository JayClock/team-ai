# Domain Module - Smart Domain DDD Core Entities

## OVERVIEW

Core Smart Domain DDD entities implementing Association Object pattern to solve N+1 queries while maintaining model purity.

## STRUCTURE

```
src/main/java/reengineering/ddd/
├── archtype/          # Core architecture interfaces
│   ├── Entity.java   # Base entity interface
│   ├── HasMany.java  # Association Object interface
│   └── Many.java     # Collection interface
├── teamai/
│   ├── model/        # Domain entities (User, Account, Conversation, Message)
│   └── description/  # Immutable description records
└── README.md         # PlantUML diagrams
```

## WHERE TO LOOK

- Association Object interfaces: `User$Accounts`, `User$Conversations`, `Conversation$Messages`
- Entity creation behaviors: `User.add()`, `Conversation.saveMessage()`, `Conversation.sendMessage()`
- Description records: `reengineering.ddd.teamai.description` package
- PlantUML diagrams: `README.md` contains synchronized UML

## CONVENTIONS

### Association Object Pattern

Solves N+1 problem by making one-to-many relationships first-class objects instead of collections. Association objects bridge domain and persistence layers, returning lightweight pointers (`user.conversations()`) without I/O. Only specific behaviors (e.g., `findAll(page)`) trigger optimized SQL.

### Wide vs Narrow Interfaces

**Wide interfaces (internal)**: Complete implementation contracts for persistence layer with full CRUD access. **Narrow interfaces (external)**: Read-only or restricted views exposing only safe operations. Example: Entity exposes `HasMany<String, Account>` read-only interface, but implements internal `Accounts` interface with `add()` method.

### Intent-Revealing Methods

Encapsulate collective logic in association objects instead of Service layer loops:

- `calculateConsumption(TimeRange)` - Token usage aggregation
- `findLatestActiveSession()` - Context restoration
- `archiveStaleConversations(int daysOld)` - Bulk operations
- `saveMessage(MessageDescription)` - Message persistence
- `sendMessage(MessageDescription)` - AI model integration

### Immutable Descriptions

All Description objects are immutable Java records defining entity properties. Created first during UML-to-code sync, used by entities for initialization.

## ANTI-PATTERNS

❌ **Direct collection access**: Never `user.getConversations()` - causes OOM and bypasses domain logic
❌ **Service layer business logic**: Collective operations belong in association objects, not services
❌ **Hardcoded relationships**: Use association objects, not raw `List<Entity>` fields
❌ **Mutable descriptions**: All Description objects must be immutable records
❌ **Intent-obscuring loops**: Replace iteration patterns with intent-revealing methods

## UML SYNC PROCESS

1. Create Description record (immutable) for entity properties
2. Implement Entity with `Entity<ID, Description>` interface
3. Add internal Association Object interfaces extending `HasMany`
4. Implement domain behaviors with intent-revealing names
5. Verify compilation: `./gradlew compileJava`
