package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeStyleProps;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.mybatis.mappers.ProjectDiagramsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectDiagramsMapperTest {
  private static final ObjectMapper objectMapper = new ObjectMapper();

  @Inject private TestDataMapper testData;
  @Inject private ProjectDiagramsMapper mapper;

  private final int userId = id();
  private final int projectId = id();
  private final int diagramId = id();
  private final int nodeId1 = id();
  private final int nodeId2 = id();
  private final int edgeId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertDiagram(
        diagramId,
        projectId,
        "Test Diagram" + diagramId,
        "class",
        "{\"x\":100,\"y\":50,\"zoom\":1.5}");
  }

  @Test
  void should_find_diagram_by_project_and_id() {
    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);
    assertNotNull(diagram);
    assertEquals(String.valueOf(diagramId), diagram.getIdentity());
    assertEquals(String.valueOf(projectId), diagram.getProjectId());
    assertEquals("Test Diagram" + diagramId, diagram.getDescription().title());
    assertEquals(DiagramType.CLASS, diagram.getDescription().type());
    assertEquals(100, diagram.getDescription().viewport().x());
    assertEquals(50, diagram.getDescription().viewport().y());
    assertEquals(1.5, diagram.getDescription().viewport().zoom());
  }

  @Test
  void should_find_diagram_with_nodes_association() {
    testData.insertDiagramNode(
        nodeId1,
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

    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);

    assertNotNull(diagram.nodes());
    int nodeCount = diagram.nodes().findAll().size();
    assertEquals(1, nodeCount);
  }

  @Test
  void should_find_diagram_with_edges_association() {
    testData.insertDiagramNode(
        nodeId1, diagramId, "class-node", null, null, 100.0, 200.0, 300, 400, "{}", "{}");
    testData.insertDiagramNode(
        nodeId2, diagramId, "class-node", null, null, 500.0, 600.0, 300, 400, "{}", "{}");
    testData.insertDiagramEdge(
        edgeId,
        diagramId,
        nodeId1,
        nodeId2,
        "source",
        "target",
        "ASSOCIATION",
        "test edge",
        "{\"stroke\":\"#000000\",\"strokeWidth\":2,\"animated\":false}");

    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);

    assertNotNull(diagram.edges());
    int edgeCount = diagram.edges().findAll().size();
    assertEquals(1, edgeCount);
  }

  @Test
  void should_find_diagram_with_multiple_nodes() {
    testData.insertDiagramNode(
        nodeId1, diagramId, "class-node", null, null, 100.0, 200.0, 300, 400, "{}", "{}");
    testData.insertDiagramNode(
        nodeId2, diagramId, "entity-node", null, null, 500.0, 600.0, 300, 400, "{}", "{}");

    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);

    assertNotNull(diagram.nodes());
    int nodeCount = diagram.nodes().findAll().size();
    assertEquals(2, nodeCount);
  }

  @Test
  void should_find_diagram_with_node_having_logical_entity_ref() {
    testData.insertDiagramNode(
        nodeId1, diagramId, "class-node", null, null, 100.0, 200.0, 300, 400, "{}", "{}");

    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);

    assertNotNull(diagram.nodes());
    DiagramNode node = diagram.nodes().findAll().stream().findFirst().get();
    assertEquals(null, node.getDescription().logicalEntity());
  }

  @Test
  void should_find_diagram_with_node_having_parent_ref() {
    int parentId = id();
    testData.insertDiagramNode(
        parentId, diagramId, "class-node", null, null, 100.0, 200.0, 300, 400, "{}", "{}");
    testData.insertDiagramNode(
        nodeId1, diagramId, "class-node", null, parentId, 500.0, 600.0, 300, 400, "{}", "{}");

    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);

    assertNotNull(diagram.nodes());
    int nodeCount = diagram.nodes().findAll().size();
    assertEquals(2, nodeCount);
  }

  @Test
  void should_find_diagrams_by_project_id() {
    int diagramId2 = id();
    testData.insertDiagram(
        diagramId2,
        projectId,
        "Test Diagram" + diagramId2,
        "sequence",
        "{\"x\":0,\"y\":0,\"zoom\":1}");

    List<Diagram> diagrams = mapper.findDiagramsByProjectId(projectId, 0, 10);

    assertEquals(2, diagrams.size());
    assertEquals(String.valueOf(diagramId), diagrams.get(0).getIdentity());
    assertEquals(String.valueOf(diagramId2), diagrams.get(1).getIdentity());
  }

  @Test
  void should_find_diagrams_with_pagination() {
    int totalBefore = mapper.countDiagramsByProject(projectId);

    for (int i = 0; i < 5; i++) {
      int newDiagramId = id();
      testData.insertDiagram(
          newDiagramId, projectId, "Diagram " + i, "class", "{\"x\":0,\"y\":0,\"zoom\":1}");
    }

    int totalAfter = mapper.countDiagramsByProject(projectId);

    List<Diagram> firstPage = mapper.findDiagramsByProjectId(projectId, 0, 3);
    assertEquals(Math.min(3, totalAfter), firstPage.size());

    if (totalAfter > 3) {
      List<Diagram> secondPage = mapper.findDiagramsByProjectId(projectId, 3, 3);
      assertEquals(Math.min(3, totalAfter - 3), secondPage.size());
    }
  }

  @Test
  void should_insert_diagram_and_get_generated_id() {
    IdHolder idHolder = new IdHolder();
    Viewport viewport = new Viewport(200, 100, 2.0);
    DiagramDescription description =
        new DiagramDescription("New Diagram", DiagramType.FLOWCHART, viewport);

    int result = mapper.insertDiagram(idHolder, projectId, description);

    assertEquals(1, result);
    assertTrue(idHolder.id() > 0);

    Diagram insertedDiagram = mapper.findDiagramByProjectAndId(projectId, idHolder.id());
    assertNotNull(insertedDiagram);
    assertEquals("New Diagram", insertedDiagram.getDescription().title());
    assertEquals(DiagramType.FLOWCHART, insertedDiagram.getDescription().type());
    assertEquals(200, insertedDiagram.getDescription().viewport().x());
    assertEquals(100, insertedDiagram.getDescription().viewport().y());
    assertEquals(2.0, insertedDiagram.getDescription().viewport().zoom());
  }

  @Test
  void should_count_diagrams_by_project() {
    int count = mapper.countDiagramsByProject(projectId);
    assertEquals(1, count);

    int diagramId2 = id();
    testData.insertDiagram(
        diagramId2, projectId, "Second Diagram", "sequence", "{\"x\":0,\"y\":0,\"zoom\":1}");

    count = mapper.countDiagramsByProject(projectId);
    assertEquals(2, count);
  }

  @Test
  void should_support_complex_node_description() throws Exception {
    testData.insertDiagramNode(
        nodeId1,
        diagramId,
        "custom-node",
        null,
        null,
        150.0,
        250.0,
        350,
        450,
        "{\"backgroundColor\":\"#ff0000\",\"textColor\":\"#ffffff\",\"fontSize\":16,\"collapsed\":true,\"hiddenAttributes\":[\"attribute1\",\"attribute2\"]}",
        "{\"content\":\"Custom content\",\"color\":\"#00ff00\",\"type\":\"custom-type\"}");

    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);
    DiagramNode node = diagram.nodes().findAll().stream().findFirst().get();

    Map<String, Object> styleConfig =
        objectMapper.readValue(
            node.getDescription().styleConfig().json(),
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
    Map<String, Object> localData =
        objectMapper.readValue(
            node.getDescription().localData().json(),
            new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

    assertEquals("#ff0000", styleConfig.get("backgroundColor"));
    assertEquals("#ffffff", styleConfig.get("textColor"));
    assertEquals(16, styleConfig.get("fontSize"));
    assertEquals(true, styleConfig.get("collapsed"));
    assertEquals(2, ((List<?>) styleConfig.get("hiddenAttributes")).size());
    assertEquals("Custom content", localData.get("content"));
    assertEquals("#00ff00", localData.get("color"));
  }

  @Test
  void should_support_complex_edge_description() {
    testData.insertDiagramNode(
        nodeId1, diagramId, "class-node", null, null, 100.0, 200.0, 300, 400, "{}", "{}");
    testData.insertDiagramNode(
        nodeId2, diagramId, "class-node", null, null, 500.0, 600.0, 300, 400, "{}", "{}");

    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    testData.insertDiagramEdge(
        edgeId,
        diagramId,
        nodeId1,
        nodeId2,
        "sourceHandle",
        "targetHandle",
        "AGGREGATION",
        "test aggregation",
        "{\"lineStyle\":\"solid\",\"color\":\"#333333\",\"arrowType\":\"arrow\",\"lineWidth\":2}");

    Diagram diagram = mapper.findDiagramByProjectAndId(projectId, diagramId);
    DiagramEdge edge = diagram.edges().findAll().stream().findFirst().get();

    assertEquals("sourceHandle", edge.getDescription().sourceHandle());
    assertEquals("targetHandle", edge.getDescription().targetHandle());
    assertEquals("AGGREGATION", edge.getDescription().relationType());
    assertEquals("test aggregation", edge.getDescription().label());
    assertEquals("solid", edge.getDescription().styleProps().lineStyle());
    assertEquals("#333333", edge.getDescription().styleProps().color());
    assertEquals("arrow", edge.getDescription().styleProps().arrowType());
    assertEquals(2, edge.getDescription().styleProps().lineWidth());
  }

  @Test
  void should_not_find_diagram_for_different_project() {
    int otherProjectId = id();
    testData.insertUser(id(), "Jane Doe", "jane.doe+" + id() + "@email.com");
    testData.insertProject(otherProjectId, userId, "Other Project");

    Diagram diagram = mapper.findDiagramByProjectAndId(otherProjectId, diagramId);
    assertTrue(diagram == null);
  }
}
