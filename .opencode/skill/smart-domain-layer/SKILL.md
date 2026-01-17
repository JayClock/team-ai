---
name: smart-domain-layer
description: |
  Domain layer patterns for Smart Domain DDD. Use when:
  (1) Creating domain entities with Association Objects pattern
  (2) Defining aggregate roots and entity relationships
  (3) Implementing wide/narrow interface pattern
---

# Domain Layer Patterns

## TDD Workflow

**IMPORTANT**: Always follow Test-First approach:

1. **Generate test code first** - Create tests for entity behavior and associations
2. **Wait for user confirmation** - User reviews and approves the test design
3. **Generate implementation code** - Only after test approval, implement the entity
4. **Verify tests pass** - Run tests to confirm implementation correctness

## Domain Layer Testing Strategy

### Test Categories

| Category              | Focus                                          | Dependencies         |
| --------------------- | ---------------------------------------------- | -------------------- |
| **Unit Tests**        | Entity behavior, business rules                | Mocked associations  |
| **Integration Tests** | Full aggregate operations with real DB         | TestContainers       |

### Testing Technology Stack

- **JUnit 5** - Test framework with `@Test`, `@Nested`, `@DisplayName`
- **Mockito** - Mock association objects for isolated unit tests
- **AssertJ** - Fluent assertions: `assertThat(entity).isNotNull()`
- **TestContainers** - PostgreSQL containers for integration tests (no H2)

### Test File Location

```
libs/backend/domain/src/test/java/reengineering/ddd/teamai/model/
├── UserTest.java                    # User entity tests
├── ConversationTest.java            # Conversation entity tests
└── MessageTest.java                 # Message entity tests
```

### Domain Unit Test Pattern

Test entity behavior with mocked associations:

```java
@ExtendWith(MockitoExtension.class)
@DisplayName("User entity")
class UserTest {

  @Mock
  private User.Conversations conversations;

  private User user;

  @BeforeEach
  void setUp() {
    user = new User("user-123", new UserDescription("test@example.com"), conversations);
  }

  @Nested
  @DisplayName("conversations()")
  class ConversationsAccess {

    @Test
    @DisplayName("should return narrow HasMany interface")
    void shouldReturnNarrowInterface() {
      // When
      HasMany<String, Conversation> result = user.conversations();

      // Then
      assertThat(result).isSameAs(conversations);
    }
  }

  @Nested
  @DisplayName("add(ConversationDescription)")
  class AddConversation {

    @Test
    @DisplayName("should delegate to conversations association")
    void shouldDelegateToAssociation() {
      // Given
      ConversationDescription description = new ConversationDescription("New Chat");
      Conversation expected = mock(Conversation.class);
      when(conversations.add(description)).thenReturn(expected);

      // When
      Conversation result = user.add(description);

      // Then
      assertThat(result).isSameAs(expected);
      verify(conversations).add(description);
    }
  }
}
```

### Association Object Test Pattern

Test association interface behavior:

```java
@DisplayName("User.Conversations interface")
class UserConversationsContractTest {

  @Test
  @DisplayName("findAll() should return Many collection")
  void findAllShouldReturnManyCollection() {
    // Given
    User.Conversations conversations = createTestConversations();

    // When
    Many<Conversation> result = conversations.findAll();

    // Then
    assertThat(result).isNotNull();
    assertThat(result.size()).isGreaterThanOrEqualTo(0);
  }

  @Test
  @DisplayName("findByIdentity() should return Optional of entity")
  void findByIdentityShouldReturnOptional() {
    // Given
    User.Conversations conversations = createTestConversations();

    // When
    Optional<Conversation> result = conversations.findByIdentity("non-existent");

    // Then
    assertThat(result).isEmpty();
  }
}
```

### Business Rule Test Pattern

Test domain invariants and business rules:

```java
@Nested
@DisplayName("Business Rules")
class BusinessRulesTest {

  @Test
  @DisplayName("should not allow empty email in UserDescription")
  void shouldNotAllowEmptyEmail() {
    assertThatThrownBy(() -> new UserDescription(""))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("email");
  }

  @Test
  @DisplayName("should enforce conversation title length limit")
  void shouldEnforceTitleLengthLimit() {
    String longTitle = "x".repeat(300);  // Exceeds 255 char limit

    assertThatThrownBy(() -> new ConversationDescription(longTitle))
      .isInstanceOf(IllegalArgumentException.class);
  }
}
```

### Test Naming Conventions

- **Test class**: `{Entity}Test.java`
- **Nested class**: `@Nested @DisplayName("method()")`
- **Test method**: `@DisplayName("should {expected behavior}")` with `shouldXxx` naming

### Run Domain Tests

```bash
# Run all domain tests
./gradlew :backend:domain:test

# Run specific test class
./gradlew :backend:domain:test --tests "*.UserTest"

# Via Nx
npx nx test backend-domain
```

## Core Archetypes

### Entity<Identity, Description>

Base interface for all domain entities:

```java
package reengineering.ddd.archtype;

public interface Entity<Identity, Description> {
  Identity getIdentity();
  Description getDescription();
}
```

### HasMany<ID, E extends Entity>

Narrow interface for read-only collection access:

```java
public interface HasMany<ID, E extends Entity<ID, ?>> {
  Many<E> findAll();
  Optional<E> findByIdentity(ID identifier);
}
```

### Many<E extends Entity>

Collection interface with streaming and pagination:

```java
public interface Many<E extends Entity<?, ?>> extends Iterable<E> {
  int size();
  Many<E> subCollection(int from, int to);
  default Stream<E> stream() {
    return StreamSupport.stream(spliterator(), false);
  }
}
```

## Wide vs Narrow Interfaces

```
┌─────────────────────────────────────────────────────────────┐
│  External Access (Narrow)                                    │
│  ─────────────────────────                                   │
│  HasMany<String, Conversation> conversations()               │
│    └─ findAll(), findByIdentity() only                       │
├─────────────────────────────────────────────────────────────┤
│  Internal Access (Wide)                                      │
│  ────────────────────────                                    │
│  interface User.Conversations extends HasMany<...> {         │
│    Conversation add(ConversationDescription);                │
│    void delete(String id);                                   │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```java
public class User implements Entity<String, UserDescription> {
  private Conversations conversations;  // Wide interface

  // External: narrow interface
  public HasMany<String, Conversation> conversations() {
    return conversations;
  }

  // Mutation: via intent-revealing method
  public Conversation add(ConversationDescription desc) {
    return conversations.add(desc);
  }

  // Wide interface definition
  public interface Conversations extends HasMany<String, Conversation> {
    Conversation add(ConversationDescription description);
    void delete(String id);
  }
}
```

## Description Records

Use Java records for value objects:

```java
public record UserDescription(String name, String email) {}
public record ConversationDescription(String title) {}
public record MessageDescription(String content, String role) {}
```

## Entity Construction

Entities require two constructors:

```java
public class Conversation implements Entity<String, ConversationDescription> {
  private String identity;
  private ConversationDescription description;
  private Messages messages;

  // Full constructor for programmatic creation
  public Conversation(String identity, ConversationDescription description, Messages messages) {
    this.identity = identity;
    this.description = description;
    this.messages = messages;
  }

  // No-arg constructor for MyBatis
  private Conversation() {}
}
```

## Aggregate Boundaries

### Rules

1. **Aggregate Root**: Only root entities have `add()` methods
2. **Navigation**: Child entities accessed via parent's association objects
3. **Identity**: Each entity has a unique identity within its aggregate

### Access Pattern

```java
// Correct: navigate through aggregate
User user = users.findById(userId).orElseThrow();
Conversation conv = user.conversations().findByIdentity(convId).orElseThrow();
Message msg = conv.messages().findByIdentity(msgId).orElseThrow();

// Wrong: bypass aggregate
Message msg = messageRepository.findById(msgId); // Never do this
```

## Change Objects

Use inner classes for mutation DTOs:

```java
public class User implements Entity<String, UserDescription> {
  public static class UserChange {
    @NotBlank @Size(max = 255)
    private String name;

    @NotBlank @Email @Size(max = 255)
    private String email;

    // getters and setters
  }
}
```

## Quick Reference

| Task                         | Location                                                                  |
| ---------------------------- | ------------------------------------------------------------------------- |
| Domain entities              | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/model/`       |
| Descriptions (Value Objects) | `libs/backend/domain/src/main/java/reengineering/ddd/teamai/description/` |
| Archetypes                   | `libs/backend/domain/src/main/java/reengineering/ddd/archtype/`           |
