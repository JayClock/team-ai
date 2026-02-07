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
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.EdgeRelationType;
import reengineering.ddd.teamai.description.EdgeStyleProps;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.mybatis.mappers.DiagramEdgesMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class DiagramEdgesMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private DiagramEdgesMapper edgesMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int diagramId = id();
  private final int sourceNodeId = id();
  private final int targetNodeId = id();
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
        "CLASS_DIAGRAM",
        "{\"x\":0,\"y\":0,\"zoom\":1}");
    testData.insertDiagramNode(
        sourceNodeId, diagramId, "class-node", null, null, 100.0, 200.0, 300, 400, "{}", "{}");
    testData.insertDiagramNode(
        targetNodeId, diagramId, "class-node", null, null, 400.0, 500.0, 300, 400, "{}", "{}");
    testData.insertDiagramEdge(
        edgeId,
        diagramId,
        sourceNodeId,
        targetNodeId,
        "source-handle-1",
        "target-handle-1",
        "ASSOCIATION",
        "hasRelation",
        "{\"lineStyle\":\"solid\",\"color\":\"#000000\",\"arrowType\":\"arrow\",\"lineWidth\":2}");
  }

  @Test
  void should_find_edge_by_diagram_and_id() {
    DiagramEdge edge = edgesMapper.findEdgeByDiagramAndId(diagramId, edgeId);
    assertEquals(String.valueOf(edgeId), edge.getIdentity());
    assertEquals("source-handle-1", edge.getDescription().sourceHandle());
    assertEquals("target-handle-1", edge.getDescription().targetHandle());
    assertEquals(EdgeRelationType.ASSOCIATION, edge.getDescription().relationType());
    assertEquals("hasRelation", edge.getDescription().label());
  }

  @Test
  void should_parse_style_props_from_jsonb() {
    DiagramEdge edge = edgesMapper.findEdgeByDiagramAndId(diagramId, edgeId);
    assertNotNull(edge.getDescription().styleProps());
    assertEquals("solid", edge.getDescription().styleProps().lineStyle());
    assertEquals("#000000", edge.getDescription().styleProps().color());
    assertEquals("arrow", edge.getDescription().styleProps().arrowType());
    assertEquals(2, edge.getDescription().styleProps().lineWidth());
  }

  @Test
  void should_parse_node_refs_correctly() {
    DiagramEdge edge = edgesMapper.findEdgeByDiagramAndId(diagramId, edgeId);
    assertNotNull(edge.getDescription().sourceNode());
    assertNotNull(edge.getDescription().targetNode());
    assertEquals(
        String.valueOf(sourceNodeId), String.valueOf(edge.getDescription().sourceNode().id()));
    assertEquals(
        String.valueOf(targetNodeId), String.valueOf(edge.getDescription().targetNode().id()));
  }

  @Test
  public void should_add_edge_to_database() {
    IdHolder idHolder = new IdHolder();
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#000000", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(String.valueOf(diagramId)),
            new Ref<>(String.valueOf(sourceNodeId)),
            new Ref<>(String.valueOf(targetNodeId)),
            "source-handle-2",
            "target-handle-2",
            EdgeRelationType.INHERITANCE,
            "extends",
            styleProps);
    edgesMapper.insertEdge(idHolder, diagramId, description);

    DiagramEdge edge = edgesMapper.findEdgeByDiagramAndId(diagramId, idHolder.id());
    assertEquals("source-handle-2", edge.getDescription().sourceHandle());
    assertEquals("target-handle-2", edge.getDescription().targetHandle());
    assertEquals(EdgeRelationType.INHERITANCE, edge.getDescription().relationType());
    assertEquals("extends", edge.getDescription().label());
  }

  @Test
  public void should_count_edges_by_diagram() {
    int count = edgesMapper.countEdgesByDiagram(diagramId);
    assertEquals(1, count);
  }

  @Test
  public void should_find_edges_by_diagram_id_with_pagination() {
    List<DiagramEdge> edges = edgesMapper.findEdgesByDiagramId(diagramId, 0, 10);
    assertEquals(1, edges.size());
    assertEquals(String.valueOf(edgeId), edges.get(0).getIdentity());
  }
}
