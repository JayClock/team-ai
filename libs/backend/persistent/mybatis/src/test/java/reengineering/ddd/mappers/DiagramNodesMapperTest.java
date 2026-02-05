package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import jakarta.inject.Inject;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.LocalNodeData;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.NodeStyleConfig;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.mybatis.mappers.DiagramNodesMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class DiagramNodesMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private DiagramNodesMapper nodesMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int diagramId = id();
  private final int nodeId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId, "domain model content");
    testData.insertDiagram(
        diagramId,
        projectId,
        "Test Diagram" + diagramId,
        "CLASS_DIAGRAM",
        "{\"x\":0,\"y\":0,\"zoom\":1}");
    testData.insertDiagramNode(
        nodeId,
        diagramId,
        "class-node",
        null,
        null,
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
  void should_parse_style_config_from_jsonb() {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertNotNull(node.getDescription().styleConfig());
    assertEquals("#ff0000", node.getDescription().styleConfig().backgroundColor());
    assertEquals("#ffffff", node.getDescription().styleConfig().textColor());
    assertEquals(14, node.getDescription().styleConfig().fontSize());
    assertEquals(false, node.getDescription().styleConfig().collapsed());
  }

  @Test
  void should_parse_local_data_from_jsonb() {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertNotNull(node.getDescription().localData());
    assertEquals("Node content", node.getDescription().localData().content());
    assertEquals("#ff6b6b", node.getDescription().localData().color());
    assertEquals("sticky-note", node.getDescription().localData().type());
  }

  @Test
  void should_parse_null_refs_correctly() {
    DiagramNode node = nodesMapper.findNodeByDiagramAndId(diagramId, nodeId);
    assertNull(node.getDescription().logicalEntity());
    assertNull(node.getDescription().parent());
  }

  @Test
  public void should_add_node_to_database() {
    IdHolder idHolder = new IdHolder();
    NodeStyleConfig styleConfig =
        new NodeStyleConfig("#00ff00", "#000000", 12, true, List.of("attr1", "attr2"));
    LocalNodeData localData = new LocalNodeData("Test content", "#00ff00", "sticky-note");
    NodeDescription description =
        new NodeDescription(
            "sticky-note", null, null, 50.0, 150.0, 200, 300, styleConfig, localData);
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
    assertEquals(1, count);
  }

  @Test
  public void should_find_nodes_by_diagram_id_with_pagination() {
    List<DiagramNode> nodes = nodesMapper.findNodesByDiagramId(diagramId, 0, 10);
    assertEquals(1, nodes.size());
    assertEquals(String.valueOf(nodeId), nodes.get(0).getIdentity());
  }
}
