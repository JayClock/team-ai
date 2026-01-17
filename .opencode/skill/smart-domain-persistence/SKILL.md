---
name: smart-domain-persistence
description: |
  Persistence layer patterns for Smart Domain DDD. Use when:
  (1) Implementing MyBatis persistence with batch-loading associations
  (2) Creating association implementations with caching
  (3) Writing MyBatis XML mappers for entities
---

# Persistence Layer Patterns

## TDD Workflow

**IMPORTANT**: Always follow Test-First approach:

1. **Generate test code first** - Create tests for mapper and association behavior
2. **Wait for user confirmation** - User reviews and approves the test design
3. **Generate implementation code** - Only after test approval, implement persistence
4. **Verify tests pass** - Run tests to confirm implementation correctness

## EntityList Base Class

Abstract base for all association implementations:

```java
public abstract class EntityList<Id, E extends Entity<Id, ?>>
    implements Many<E>, HasMany<Id, E> {

  @Override
  public final Many<E> findAll() { return this; }

  @Override
  public final Optional<E> findByIdentity(Id id) {
    return Optional.ofNullable(findEntity(id));
  }

  @Override
  public final Many<E> subCollection(int from, int to) {
    return new memory.EntityList<>(findEntities(from, to));
  }

  @Override
  public final Iterator<E> iterator() {
    return new BatchIterator();
  }

  // Subclasses implement these
  protected abstract List<E> findEntities(int from, int to);
  protected abstract E findEntity(Id id);
  public abstract int size();

  // Override for custom batch size (default: 100)
  protected int batchSize() { return 100; }
}
```

## Association Implementation Pattern

```java
@AssociationMapping(entity = User.class, field = "conversations", parentIdField = "userId")
public class UserConversations extends EntityList<String, Conversation>
    implements User.Conversations {

  // Cache names
  private static final String CACHE_NAME = "userConversations";
  private static final String CACHE_LIST = "userConversationsList";
  private static final String CACHE_COUNT = "userConversationsCount";

  // Parent ID injected by MyBatis
  private int userId;

  @Inject private UserConversationsMapper mapper;

  @Override
  @Cacheable(value = CACHE_LIST, key = "#root.target.userId + ':' + #from + ':' + #to")
  protected List<Conversation> findEntities(int from, int to) {
    return mapper.findConversationsByUserId(userId, from, to - from);
  }

  @Override
  @Cacheable(value = CACHE_NAME, key = "#root.target.userId + ':' + #id", unless = "#result == null")
  protected Conversation findEntity(String id) {
    return mapper.findConversationByUserAndId(userId, Integer.parseInt(id));
  }

  @Override
  @Cacheable(value = CACHE_COUNT, key = "#root.target.userId")
  public int size() {
    return mapper.countConversationByUser(userId);
  }

  @Override
  @Caching(evict = {
    @CacheEvict(value = CACHE_LIST, allEntries = true),
    @CacheEvict(value = CACHE_COUNT, key = "#root.target.userId")
  })
  public Conversation add(ConversationDescription description) {
    IdHolder idHolder = new IdHolder();
    mapper.insertConversation(idHolder, userId, description);
    return findEntity(String.valueOf(idHolder.id()));
  }

  @Override
  @Caching(evict = {
    @CacheEvict(value = CACHE_NAME, key = "#root.target.userId + ':' + #id"),
    @CacheEvict(value = CACHE_LIST, allEntries = true),
    @CacheEvict(value = CACHE_COUNT, key = "#root.target.userId")
  })
  public void delete(String id) {
    mapper.deleteConversation(userId, Integer.parseInt(id));
  }
}
```

## MyBatis Mapper Interface

```java
@Mapper
public interface UserConversationsMapper {
  Conversation findConversationByUserAndId(
    @Param("user_id") int userId,
    @Param("id") int id
  );

  List<Conversation> findConversationsByUserId(
    @Param("user_id") int userId,
    @Param("from") int from,
    @Param("size") int size
  );

  int insertConversation(
    @Param("holder") IdHolder id,
    @Param("user_id") int userId,
    @Param("description") ConversationDescription description
  );

  int countConversationByUser(@Param("user_id") int userId);

  int deleteConversation(@Param("user_id") int userId, @Param("id") int id);
}
```

## MyBatis XML Mapping

### Result Map with Associations

```xml
<resultMap id="conversation" type="reengineering.ddd.teamai.model.Conversation">
  <!-- Identity mapping -->
  <id property="identity" column="id" jdbcType="VARCHAR" javaType="String"/>

  <!-- Description via constructor (record) -->
  <association property="description"
               javaType="reengineering.ddd.teamai.description.ConversationDescription">
    <constructor>
      <arg column="title" jdbcType="VARCHAR" javaType="String"/>
    </constructor>
  </association>

  <!-- Nested association object (not constructor) -->
  <association property="messages"
               javaType="reengineering.ddd.teamai.mybatis.associations.ConversationMessages">
    <result column="id" property="conversationId" javaType="int"/>
  </association>
</resultMap>
```

### Query with Pagination

```xml
<select id="findConversationsByUserId" resultMap="conversation">
  SELECT id, title
  FROM conversations
  WHERE user_id = #{user_id}
  LIMIT #{size} OFFSET #{from}
</select>
```

### Insert with Generated Key

```xml
<insert id="insertConversation"
        useGeneratedKeys="true"
        keyProperty="holder.id"
        keyColumn="id">
  INSERT INTO conversations(title, user_id)
  VALUES (#{description.title}, #{user_id})
</insert>
```

### Delete with Cascade

```xml
<delete id="deleteConversation">
  DELETE FROM messages WHERE conversation_id = #{id};
  DELETE FROM conversations WHERE user_id = #{user_id} AND id = #{id}
</delete>
```

## IdHolder Pattern

Capture auto-generated IDs:

```java
public class IdHolder {
  private int id;
  public int id() { return id; }
  public void setId(int id) { this.id = id; }
}
```

## Caching Strategy

### Three Cache Types per Association

1. **CACHE_NAME**: Single entity by ID
2. **CACHE_LIST**: Paginated lists
3. **CACHE_COUNT**: Collection size

### Cache Key Pattern

```java
key = "#root.target.userId + ':' + #id"
// Results in: "123:456" for user 123, entity 456
```

### Cache Eviction Rules

| Operation | Evict CACHE_NAME | Evict CACHE_LIST | Evict CACHE_COUNT |
| --------- | ---------------- | ---------------- | ----------------- |
| add()     | No               | All entries      | Yes               |
| delete()  | Specific entry   | All entries      | Yes               |
| update()  | Specific entry   | All entries      | No                |

## @AssociationMapping Annotation

```java
@AssociationMapping(
  entity = User.class,      // Parent entity class
  field = "conversations",  // Field name in parent
  parentIdField = "userId"  // Field in this class holding parent ID
)
```

## Dependency Injection in MyBatis

MyBatis creates objects via custom ObjectFactory that injects Spring beans:

```java
public class InjectableObjectFactory extends DefaultObjectFactory {
  @Override
  public <T> T create(Class<T> type) {
    T instance = super.create(type);
    ApplicationContextHolder.getContext().getAutowireCapableBeanFactory()
      .autowireBean(instance);
    return instance;
  }
}
```

## Quick Reference

| Task                        | Location                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Association implementations | `libs/backend/persistent/mybatis/src/main/java/reengineering/ddd/teamai/mybatis/associations/` |
| MyBatis mappers             | `libs/backend/persistent/mybatis/src/main/java/reengineering/ddd/teamai/mybatis/mappers/`      |
| MyBatis XML                 | `libs/backend/persistent/mybatis/src/main/resources/mybatis.mappers/`                          |
