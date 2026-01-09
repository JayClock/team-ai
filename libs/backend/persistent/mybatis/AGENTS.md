# PERSISTENCE LAYER - MyBatis + Association Objects

**Generated:** 2026-01-09
**Module:** Database persistence with MyBatis + TestContainers + Association Object implementations
**Core:** Association Object pattern bridging domain and persistence layers

## OVERVIEW

MyBatis persistence layer implementing Association Object pattern to bridge Smart Domain entities with database operations while maintaining encapsulation and performance.

## STRUCTURE

```
libs/backend/persistent/mybatis/src/main/java/reengineering/ddd/
├── mybatis/
│   ├── associations/         # Association Object implementations (UserConversations, etc.)
│   ├── database/            # EntityList implementations (in-memory for tests)
│   ├── memory/              # EntityList implementations (in-memory for tests)
│   └── support/             # MyBatis utilities (ObjectFactory, converters)
├── teamai/
│   ├── mapper/             # MyBatis XML mappers (UserMapper, ConversationMapper)
│   └── model/              # MyBatis entity definitions
└── test/
    ├── TestApplication.java   # Spring Boot test configuration
    ├── TestContainerConfig.java # TestContainers PostgreSQL setup
    ├── TestDataMapper.java   # Test data setup utilities
    └── *Test.java            # Integration tests with TestContainers
```

## WHERE TO LOOK

| Task                        | Location                                                      | Notes                          |
| --------------------------- | ------------------------------------------------------------- | ------------------------------ |
| Association implementations | `mybatis/associations/*Association.java`                      | Implements HasMany interfaces  |
| MyBatis mappers             | `teamai/mapper/*Mapper.xml`                                   | SQL queries, association logic |
| MyBatis entities            | `teamai/model/*.java`                                         | Database table mapping         |
| TestContainers config       | `test/TestContainerConfig.java` # PostgreSQL Docker container |
| EntityList implementations  | `mybatis/database/EntityList.java` # Production list impl     |
| ObjectFactory               | `mybatis/support/ObjectFactory.java` # MyBatis object factory |
| TestApplication             | `test/TestApplication.java` # Minimal Spring Boot test app    |

## CONVENTIONS

### Association Object Implementation

**Pattern:** Association Objects implement domain `HasMany<ID, Entity>` interfaces and delegate to MyBatis mappers.

- **Lazy loading:** Return lightweight Association Object (no I/O), execute SQL only on `findAll()` or `findByIdentity()`
- **Optimized queries:** MyBatis mappers use JOIN queries for efficient data retrieval
- **Pagination support:** All associations support `findAll(page)` for paginated results

**Example:**

```java
// Domain interface (in libs/backend/domain)
public interface Conversations extends HasMany<String, Conversation> {
    Conversation saveMessage(MessageDescription description);
    Conversation sendMessage(MessageDescription description);
}

// Persistent implementation (in this module)
@Component
public class UserConversations implements Conversations {
    private final ConversationMapper mapper;

    // No query in constructor - lazy!
    public UserConversations(ConversationMapper mapper) {
        this.mapper = mapper;
    }

    // Triggers optimized SQL on first access
    @Override
    public Many<Conversation> findAll(Page page) {
        return mapper.findByUserId(userId, page);
    }
}
```

### MyBatis Mapper Configuration

**Mapper XML location:** `src/main/resources/reengineering/ddd/teamai/mapper/*Mapper.xml`

**Convention:**

- Namespace matches package: `reengineering.ddd.teamai.mapper`
- Result types: Association Object implementations or Many<Conversation>
- Use `<association>` tags for one-to-many relationships
- Optimize queries with JOINs to avoid N+1 problems

### TestContainers Integration

**Configuration:** `TestContainerConfig.java` sets up PostgreSQL Docker containers for integration tests.

- **No H2 mocks:** Always use real PostgreSQL in Docker
- **Flyway migrations:** Auto-apply on test startup
- **Test isolation:** Each test gets fresh database container

### EntityList Implementations

**Production:** `mybatis/database/EntityList.java` (uses MyBatis session)

**Test:** `mybatis/memory/EntityList.java` (in-memory for unit tests)

**Purpose:** Provide `Many<Entity>` collection interface for pagination and stream operations.

## ANTI-PATTERNS

### Forbidden Patterns

❌ **Direct Mapper Access in Jersey Resources**

- Never: Inject MyBatis mappers directly into Jersey `*Api` classes
- Always: Use domain services and association interfaces (`user.conversations()`)

❌ **Bypassing Domain Association Objects**

- Never: Call MyBatis mappers to bypass domain logic
- Always: Go through Association Object interfaces (`UserConversations.findAll()`)

❌ **N+1 Query Patterns**

- Never: Loop through collections and call individual queries inside loops
- Always: Use optimized JOIN queries in MyBatis mapper XML

❌ **Manual SQL Construction**

- Never: Write raw SQL strings in Java code
- Always: Use MyBatis mapper XML for all SQL queries

❌ **Test H2 Databases**

- Never: Use H2 in-memory database for integration tests
- Always: Use TestContainers with real PostgreSQL

## INTEGRATION POINTS

**Domain → Persistent:**

- Domain defines `HasMany<String, Conversation>` interfaces
- Persistent implements these interfaces as `UserConversations` classes
- Spring DI injects implementations into domain entities

**TestContainers Setup:**

```java
@TestConfiguration
public class TestContainerConfig {
    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgres() {
        return new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");
    }
}
```

## NOTES

**Key Implementation Details:**

1. **Association Objects Bridge:** Association Objects are the critical bridge between domain purity and performance. They hide MyBatis implementation details while exposing clean domain interfaces.

2. **Lazy Evaluation Pattern:** Constructors take Mapper references but execute no queries. Queries run only when `findAll()` or `findByIdentity()` are called.

3. **Optimized SQL:** MyBatis mappers use LEFT JOIN for one-to-many relationships to fetch data in single query, avoiding N+1.

4. **TestContainers Auto-Start:** PostgreSQL containers start automatically before tests and are cleaned up after all tests complete.

5. **Flyway Migrations:** Schema migrations run automatically on test container startup.

**Gotchas:**

- MyBatis `ObjectFactory` needed for custom type conversions (EntityList implementations)
- Entity List interfaces (`Many<Entity>`) must be implemented both in database and memory for test coverage
- Test `@DataJpaTest` won't work - use `@SpringBootTest` with TestContainers
