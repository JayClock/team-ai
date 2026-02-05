package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.inject.Inject;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.EntityDefinition;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.mybatis.mappers.ProjectLogicalEntitiesMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectLogicalEntitiesMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectLogicalEntitiesMapper logicalEntitiesMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int entityId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertLogicalEntity(
        entityId,
        projectId,
        "AGGREGATE",
        "Order",
        "订单",
        "{\"description\":\"测试实体\",\"tags\":[],\"attributes\":[],\"behaviors\":[]}",
        "DRAFT");
  }

  @Test
  void should_find_logical_entity_by_project_and_id() {
    LogicalEntity entity =
        logicalEntitiesMapper.findLogicalEntityByProjectAndId(projectId, entityId);
    assertEquals(String.valueOf(entityId), entity.getIdentity());
    assertEquals("Order", entity.getDescription().name());
    assertEquals("订单", entity.getDescription().label());
    assertEquals("AGGREGATE", entity.getDescription().type());
    assertEquals("DRAFT", entity.getDescription().status());
  }

  @Test
  void should_parse_definition_from_jsonb() {
    LogicalEntity entity =
        logicalEntitiesMapper.findLogicalEntityByProjectAndId(projectId, entityId);
    assertNotNull(entity.getDescription().definition());
    assertEquals("测试实体", entity.getDescription().definition().description());
  }

  @Test
  public void should_add_logical_entity_to_database() {
    IdHolder idHolder = new IdHolder();
    EntityDefinition definition =
        new EntityDefinition("业务描述", List.of("Core"), List.of(), List.of());
    LogicalEntityDescription description =
        new LogicalEntityDescription(
            "ENTITY", "Customer", "客户", definition, "DRAFT", new Ref<>(String.valueOf(projectId)));
    logicalEntitiesMapper.insertLogicalEntity(idHolder, description);

    LogicalEntity entity =
        logicalEntitiesMapper.findLogicalEntityByProjectAndId(projectId, idHolder.id());
    assertEquals("Customer", entity.getDescription().name());
    assertEquals("客户", entity.getDescription().label());
    assertEquals("业务描述", entity.getDescription().definition().description());
  }

  @Test
  public void should_count_logical_entities_by_project() {
    int count = logicalEntitiesMapper.countLogicalEntitiesByProject(projectId);
    assertEquals(1, count);
  }

  @Test
  public void should_find_logical_entities_by_project_id_with_pagination() {
    List<LogicalEntity> entities =
        logicalEntitiesMapper.findLogicalEntitiesByProjectId(projectId, 0, 10);
    assertEquals(1, entities.size());
    assertEquals(String.valueOf(entityId), entities.get(0).getIdentity());
  }
}
