# Smart Domain DDD - Domain Module

## OVERVIEW

Smart Domain DDD core module with Java entities implementing Association Object pattern for HATEOAS APIs.

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

- Association Objects: `User$Accounts`, `User$Conversations`, `Conversation$Messages`
- Entity creation: `User.add()`, `Conversation.saveMessage()` methods
- Description objects: `reengineering.ddd.teamai.description` package
- PlantUML diagrams: `README.md` contains synchronized UML

## CONVENTIONS

- Association Object pattern: Use internal interfaces extending `HasMany<ID, Entity>`
- Wide vs Narrow interfaces: Internal interfaces have full access, external exposes only read-only
- Intent-revealing methods: `calculateConsumption()`, `saveMessage()` instead of loops
- Description objects: Immutable Java records for entity properties
- Entity creation: Through domain methods, never direct collection access
- UML-to-code sync: One-way sync from UML to code (never reverse)

## ANTI-PATTERNS

❌ Direct collection access: Never `user.getConversations()` - causes OOM
❌ Service layer logic: Business logic belongs in domain, not services  
❌ Hardcoded relationships: Use association objects, not raw lists
❌ Mutable descriptions: All Description objects must be immutable records
❌ DTO copying: Zero-copy wrapper pattern, no entity-to-DTO mapping

## UML SYNC PROCESS

1. Identify change type: New entity, interface, relationship, or property
2. Create Description record first (immutable)
3. Implement Entity with `Entity<ID, Description>`
4. Add internal Association Object interfaces extending `HasMany`
5. Implement domain behaviors with intent-revealing names
6. Verify compilation: `./gradlew compileJava`
