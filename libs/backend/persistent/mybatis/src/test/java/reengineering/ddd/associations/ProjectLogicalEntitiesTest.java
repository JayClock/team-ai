package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import reengineering.ddd.FlywayConfig;
import reengineering.ddd.TestCacheConfig;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.TestDataSetup;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.EntityDefinition;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectLogicalEntitiesTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;
  @Inject private TestDataMapper testData;

  private User user;
  private Project project;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findByIdentity("1").get();
    project = user.projects().findAll().stream().findFirst().get();
  }

  @Test
  public void should_get_logical_entities_association_of_project() {
    int initialSize = project.logicalEntities().findAll().size();
    assertEquals(0, initialSize);
  }

  @Test
  public void should_add_logical_entity_and_return_saved_entity() {
    EntityDefinition definition =
        new EntityDefinition("订单业务定义", List.of("Core"), List.of(), List.of());
    var description =
        new LogicalEntityDescription(
            "AGGREGATE", "Order", "订单", definition, "DRAFT", new Ref<>(project.getIdentity()));

    LogicalEntity savedEntity = project.addLogicalEntity(description);

    assertEquals("Order", savedEntity.getDescription().name());
    assertEquals("订单", savedEntity.getDescription().label());
    assertEquals("AGGREGATE", savedEntity.getDescription().type());
    assertEquals("订单业务定义", savedEntity.getDescription().definition().description());

    var retrievedEntity = project.logicalEntities().findByIdentity(savedEntity.getIdentity()).get();
    assertEquals(savedEntity.getIdentity(), retrievedEntity.getIdentity());
    assertEquals(savedEntity.getDescription().name(), retrievedEntity.getDescription().name());
  }

  @Test
  public void should_find_single_logical_entity_of_project() {
    EntityDefinition definition = new EntityDefinition("测试定义", List.of(), List.of(), List.of());
    var description =
        new LogicalEntityDescription(
            "ENTITY", "Customer", "客户", definition, "DRAFT", new Ref<>(project.getIdentity()));
    LogicalEntity savedEntity = project.addLogicalEntity(description);

    LogicalEntity entity =
        project.logicalEntities().findByIdentity(savedEntity.getIdentity()).get();
    assertEquals(savedEntity.getIdentity(), entity.getIdentity());
    assertEquals("Customer", entity.getDescription().name());

    var cachedEntity = project.logicalEntities().findByIdentity(savedEntity.getIdentity()).get();
    assertEquals(entity.getIdentity(), cachedEntity.getIdentity());
    assertEquals(entity.getDescription().name(), cachedEntity.getDescription().name());
  }

  @Test
  public void should_not_find_logical_entity_by_project_and_id_if_not_exist() {
    assertTrue(project.logicalEntities().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_get_size_of_logical_entities_association() {
    int initialSize = project.logicalEntities().findAll().size();

    EntityDefinition definition = new EntityDefinition("", List.of(), List.of(), List.of());
    var description =
        new LogicalEntityDescription(
            "AGGREGATE", "Product", "产品", definition, "DRAFT", new Ref<>(project.getIdentity()));
    project.addLogicalEntity(description);

    int newSize = project.logicalEntities().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_evict_cache_on_add_logical_entity() {
    int initialSize = project.logicalEntities().findAll().size();

    EntityDefinition definition = new EntityDefinition("", List.of(), List.of(), List.of());
    var description =
        new LogicalEntityDescription(
            "VALUE_OBJECT", "Money", "金额", definition, "DRAFT", new Ref<>(project.getIdentity()));
    project.addLogicalEntity(description);

    int newSize = project.logicalEntities().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_cache_logical_entity_list_by_range() {
    EntityDefinition definition = new EntityDefinition("", List.of(), List.of(), List.of());
    for (int i = 0; i < 5; i++) {
      var description =
          new LogicalEntityDescription(
              "ENTITY",
              "Entity" + i,
              "实体" + i,
              definition,
              "DRAFT",
              new Ref<>(project.getIdentity()));
      project.addLogicalEntity(description);
    }

    var firstCall = project.logicalEntities().findAll().subCollection(0, 3);
    var secondCall = project.logicalEntities().findAll().subCollection(0, 3);

    assertEquals(firstCall.size(), secondCall.size());
    assertEquals(3, secondCall.size());
  }

  @Test
  public void should_cache_logical_entity_count() {
    int firstCall = project.logicalEntities().findAll().size();
    int secondCall = project.logicalEntities().findAll().size();

    assertEquals(firstCall, secondCall);
  }
}
