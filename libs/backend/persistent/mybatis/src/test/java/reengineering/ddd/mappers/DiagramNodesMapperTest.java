package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.mybatis.mappers.DiagramNodesMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class DiagramNodesMapperTest {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private DiagramNodesMapper nodesMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int diagramId = id();
  private final int nodeId = id();
  private final int logicalEntityId = id();
  private final int parentNodeId = id();
  private final int otherProjectId = id();
  private final int otherLogicalEntityId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertProject(otherProjectId, userId, "Other Project" + otherProjectId);
    testData.insertProjectMember(projectId, userId);
    testData.insertProjectMember(otherProjectId, userId);
    testData.insertLogicalEntity(
        logicalEntityId,
        projectId,
        LogicalEntityDescription.Type.CONTEXT,
        null,
        "TestEntity",
        "Test Entity Label",
        "{}");
    testData.insertLogicalEntity(
        otherLogicalEntityId,
        otherProjectId,
        LogicalEntityDescription.Type.CONTEXT,
        null,
        "OtherEntity",
        "Other Entity Label",
        "{}");
    testData.insertDiagram(
        diagramId,
        projectId,
        "Test Diagram" + diagramId,
        "CLASS_DIAGRAM",
        "{\"x\":0,\"y\":0,\"zoom\":1}");
    // Insert parent node first (with null refs)
    testData.insertDiagramNode(
        parentNodeId, diagramId, "group-node", null, null, 0.0, 0.0, 800, 600, null, null);
    // Insert child node with non-null logicalEntityId and parentId
    testData.insertDiagramNode(
        nodeId,
        diagramId,
        "class-node",
        logicalEntityId,
        parentNodeId,
        100.0,
        200.0,
        300,
        400,
        "{\"backgroundColor\":\"#ff0000\",\"textColor\":\"#ffffff\",\"fontSize\":14,\"collapsed\":false,\"hiddenAttributes\":[]}",
        "{\"content\":\"Node content\",\"color\":\"#ff6b6b\",\"type\":\"sticky-note\"}");
  }

  @Test
  void should_find_node_by_diagram_and_id() {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertEquals(String.valueOf(nodeId), node.getIdentity());
    assertEquals("class-node", node.getDescription().type());
    assertEquals(100.0, node.getDescription().positionX());
    assertEquals(200.0, node.getDescription().positionY());
    assertEquals(300, node.getDescription().width());
    assertEquals(400, node.getDescription().height());
  }

  @Test
  void should_parse_style_config_from_jsonb() throws Exception {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertNotNull(node.getDescription().styleConfig());
    Map<String, Object> styleConfig =
        objectMapper.readValue(
            node.getDescription().styleConfig().json(),
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
    assertEquals("#ff0000", styleConfig.get("backgroundColor"));
    assertEquals("#ffffff", styleConfig.get("textColor"));
    assertEquals(14, styleConfig.get("fontSize"));
    assertEquals(false, styleConfig.get("collapsed"));
  }

  @Test
  void should_parse_local_data_from_jsonb() throws Exception {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertNotNull(node.getDescription().localData());
    Map<String, Object> localData =
        objectMapper.readValue(
            node.getDescription().localData().json(),
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
    assertEquals("Node content", localData.get("content"));
    assertEquals("#ff6b6b", localData.get("color"));
    assertEquals("sticky-note", localData.get("type"));
  }

  @Test
  void should_parse_non_null_refs_correctly() {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertEquals(String.valueOf(logicalEntityId), node.getDescription().logicalEntity().id());
    assertEquals(String.valueOf(parentNodeId), node.getDescription().parent().id());
  }

  @Test
  void should_not_create_empty_shell_logical_entity_when_logical_entity_id_is_null()
      throws Exception {
    DiagramNode parentNode = nodesMapper.findNodeByDiagramAndId(diagramId, parentNodeId);
    assertNull(parentNode.getDescription().logicalEntity());
    assertNull(parentNode.logicalEntity());
    assertNull(readInternalLogicalEntity(parentNode));
  }

  @Test
  void should_not_hydrate_logical_entity_when_referenced_entity_is_in_another_project()
      throws Exception {
    int crossProjectNodeId = id();
    testData.insertDiagramNode(
        crossProjectNodeId,
        diagramId,
        "class-node",
        otherLogicalEntityId,
        null,
        120.0,
        240.0,
        300,
        200,
        "{}",
        "{}");

    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, crossProjectNodeId);
    assertNotNull(node.getDescription().logicalEntity());
    assertEquals(String.valueOf(otherLogicalEntityId), node.getDescription().logicalEntity().id());
    assertNull(node.logicalEntity());
    assertNull(readInternalLogicalEntity(node));
  }

  @Test
  public void should_add_node_to_database() throws Exception {
    IdHolder idHolder = new IdHolder();
    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#00ff00",
                "textColor",
                "#000000",
                "fontSize",
                12,
                "collapsed",
                true,
                "hiddenAttributes",
                List.of("attr1", "attr2")));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Test content",
                "color", "#00ff00",
                "type", "sticky-note"));
    NodeDescription description =
        new NodeDescription(
            "sticky-note",
            null,
            null,
            50.0,
            150.0,
            200,
            300,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));
    nodesMapper.insertNode(idHolder, diagramId, description);

    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, idHolder.id());
    assertEquals("sticky-note", node.getDescription().type());
    assertEquals(50.0, node.getDescription().positionX());
    assertEquals(150.0, node.getDescription().positionY());
    assertEquals(200, node.getDescription().width());
    assertEquals(300, node.getDescription().height());
  }

  @Test
  public void should_count_nodes_by_diagram() {
    int count = nodesMapper.countNodesByDiagram(diagramId);
    assertEquals(2, count);
  }

  @Test
  public void should_find_nodes_by_diagram_id() {
    List<DiagramNode> nodes = nodesMapper.findNodesByDiagramId(diagramId);
    assertEquals(2, nodes.size());
  }

  private Object readInternalLogicalEntity(DiagramNode node) throws Exception {
    Field relationField = DiagramNode.class.getDeclaredField("logicalEntity");
    relationField.setAccessible(true);
    Object relation = relationField.get(node);
    if (relation == null) {
      return null;
    }

    Field entityField = relation.getClass().getDeclaredField("entity");
    entityField.setAccessible(true);
    return entityField.get(relation);
  }
}
