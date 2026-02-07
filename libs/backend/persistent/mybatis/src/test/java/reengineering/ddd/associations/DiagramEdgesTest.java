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
import reengineering.ddd.TestDataSetup;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.EdgeStyleProps;
import reengineering.ddd.teamai.description.LocalNodeData;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.NodeStyleConfig;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class DiagramEdgesTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;
  @Inject private reengineering.ddd.TestDataMapper testData;

  private User user;
  private Diagram diagram;
  private DiagramNode node1;
  private DiagramNode node2;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findByIdentity("1").get();
    diagram =
        user.projects().findAll().stream().findFirst().get().diagrams().findAll().stream()
            .findFirst()
            .orElseGet(
                () -> {
                  var project = user.projects().findAll().stream().findFirst().get();
                  return project.addDiagram(
                      new DiagramDescription(
                          "Test Diagram", DiagramType.CLASS, new Viewport(0, 0, 1.0)));
                });

    NodeStyleConfig styleConfig1 = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData1 = new LocalNodeData("Source Node", "#00ff00", "note");
    NodeDescription nodeDesc1 =
        new NodeDescription(
            "source-node", null, null, 100.0, 200.0, 300, 400, styleConfig1, localData1);
    node1 = diagram.addNode(nodeDesc1);

    NodeStyleConfig styleConfig2 = new NodeStyleConfig("#0000ff", "#ffffff", 14, false, List.of());
    LocalNodeData localData2 = new LocalNodeData("Target Node", "#ffff00", "note");
    NodeDescription nodeDesc2 =
        new NodeDescription(
            "target-node", null, null, 500.0, 600.0, 300, 400, styleConfig2, localData2);
    node2 = diagram.addNode(nodeDesc2);
  }

  @Test
  public void should_get_edges_association_of_diagram() {
    int initialSize = diagram.edges().findAll().size();
    assertTrue(initialSize >= 0, "Initial edges count should be non-negative");
  }

  @Test
  public void should_add_edge_and_return_saved_entity() {
    int initialSize = diagram.edges().findAll().size();

    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "sourceHandle",
            "targetHandle",
            "ASSOCIATION",
            "test edge",
            styleProps);

    DiagramEdge savedEdge = diagram.addEdge(description);

    assertEquals("sourceHandle", savedEdge.getDescription().sourceHandle());
    assertEquals("targetHandle", savedEdge.getDescription().targetHandle());
    assertEquals("ASSOCIATION", savedEdge.getDescription().relationType());
    assertEquals("test edge", savedEdge.getDescription().label());
    assertEquals("solid", savedEdge.getDescription().styleProps().lineStyle());
    assertEquals("#333333", savedEdge.getDescription().styleProps().color());
    assertEquals("arrow", savedEdge.getDescription().styleProps().arrowType());
    assertEquals(2, savedEdge.getDescription().styleProps().lineWidth());
    assertEquals(diagram.getIdentity(), savedEdge.getDiagramId());

    var retrievedEdge = diagram.edges().findByIdentity(savedEdge.getIdentity()).get();
    assertEquals(savedEdge.getIdentity(), retrievedEdge.getIdentity());
    assertEquals(
        savedEdge.getDescription().relationType(), retrievedEdge.getDescription().relationType());
  }

  @Test
  public void should_find_single_edge_of_diagram() {
    EdgeStyleProps styleProps = new EdgeStyleProps("dashed", "#666666", "diamond", 1);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "source",
            "target",
            "AGGREGATION",
            "aggregation edge",
            styleProps);
    DiagramEdge savedEdge = diagram.addEdge(description);

    DiagramEdge edge = diagram.edges().findByIdentity(savedEdge.getIdentity()).get();
    assertEquals(savedEdge.getIdentity(), edge.getIdentity());
    assertEquals("AGGREGATION", edge.getDescription().relationType());
    assertEquals("aggregation edge", edge.getDescription().label());

    var cachedEdge = diagram.edges().findByIdentity(savedEdge.getIdentity()).get();
    assertEquals(edge.getIdentity(), cachedEdge.getIdentity());
    assertEquals(edge.getDescription().relationType(), cachedEdge.getDescription().relationType());
  }

  @Test
  public void should_not_find_edge_by_diagram_and_id_if_not_exist() {
    assertTrue(diagram.edges().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_get_size_of_edges_association() {
    int initialSize = diagram.edges().findAll().size();

    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "sourceHandle",
            "targetHandle",
            "ASSOCIATION",
            "test edge",
            styleProps);
    diagram.addEdge(description);

    int newSize = diagram.edges().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_evict_cache_on_add_edge() {
    int initialSize = diagram.edges().findAll().size();

    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "sourceHandle",
            "targetHandle",
            "ASSOCIATION",
            "cache test edge",
            styleProps);
    diagram.addEdge(description);

    int newSize = diagram.edges().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_cache_edges_list_by_range() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);

    for (int i = 0; i < 5; i++) {
      EdgeDescription description =
          new EdgeDescription(
              new Ref<>(node1.getIdentity()),
              new Ref<>(node2.getIdentity()),
              "source" + i,
              "target" + i,
              "ASSOCIATION",
              "edge " + i,
              styleProps);
      diagram.addEdge(description);
    }

    var firstCall = diagram.edges().findAll().subCollection(0, 3);
    var secondCall = diagram.edges().findAll().subCollection(0, 3);

    assertEquals(firstCall.size(), secondCall.size());
  }

  @Test
  public void should_cache_edges_count() {
    int firstCall = diagram.edges().findAll().size();
    int secondCall = diagram.edges().findAll().size();

    assertEquals(firstCall, secondCall);
  }

  @Test
  public void should_support_multiple_relation_types() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);

    DiagramEdge association =
        diagram.addEdge(
            new EdgeDescription(
                new Ref<>(node1.getIdentity()),
                new Ref<>(node2.getIdentity()),
                "source",
                "target",
                "ASSOCIATION",
                "assoc edge",
                styleProps));
    assertEquals("ASSOCIATION", association.getDescription().relationType());

    DiagramEdge aggregation =
        diagram.addEdge(
            new EdgeDescription(
                new Ref<>(node1.getIdentity()),
                new Ref<>(node2.getIdentity()),
                "source",
                "target",
                "AGGREGATION",
                "agg edge",
                styleProps));
    assertEquals("AGGREGATION", aggregation.getDescription().relationType());

    DiagramEdge composition =
        diagram.addEdge(
            new EdgeDescription(
                new Ref<>(node1.getIdentity()),
                new Ref<>(node2.getIdentity()),
                "source",
                "target",
                "COMPOSITION",
                "comp edge",
                styleProps));
    assertEquals("COMPOSITION", composition.getDescription().relationType());

    DiagramEdge dependency =
        diagram.addEdge(
            new EdgeDescription(
                new Ref<>(node1.getIdentity()),
                new Ref<>(node2.getIdentity()),
                "source",
                "target",
                "DEPENDENCY",
                "dep edge",
                styleProps));
    assertEquals("DEPENDENCY", dependency.getDescription().relationType());
  }

  @Test
  public void should_support_different_handle_types() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "top-left",
            "bottom-right",
            "ASSOCIATION",
            "handle test",
            styleProps);
    DiagramEdge edge = diagram.addEdge(description);

    assertEquals("top-left", edge.getDescription().sourceHandle());
    assertEquals("bottom-right", edge.getDescription().targetHandle());
  }

  @Test
  public void should_support_various_edge_styles() {
    EdgeStyleProps solidProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    DiagramEdge solidEdge =
        diagram.addEdge(
            new EdgeDescription(
                new Ref<>(node1.getIdentity()),
                new Ref<>(node2.getIdentity()),
                "source",
                "target",
                "ASSOCIATION",
                "solid",
                solidProps));
    assertEquals("solid", solidEdge.getDescription().styleProps().lineStyle());
    assertEquals("#333333", solidEdge.getDescription().styleProps().color());
    assertEquals("arrow", solidEdge.getDescription().styleProps().arrowType());
    assertEquals(2, solidEdge.getDescription().styleProps().lineWidth());

    EdgeStyleProps dashedProps = new EdgeStyleProps("dashed", "#666666", "diamond", 1);
    DiagramEdge dashedEdge =
        diagram.addEdge(
            new EdgeDescription(
                new Ref<>(node1.getIdentity()),
                new Ref<>(node2.getIdentity()),
                "source",
                "target",
                "AGGREGATION",
                "dashed",
                dashedProps));
    assertEquals("dashed", dashedEdge.getDescription().styleProps().lineStyle());
    assertEquals("#666666", dashedEdge.getDescription().styleProps().color());
    assertEquals("diamond", dashedEdge.getDescription().styleProps().arrowType());
    assertEquals(1, dashedEdge.getDescription().styleProps().lineWidth());
  }

  @Test
  public void should_add_multiple_edges_to_diagram() {
    int initialSize = diagram.edges().findAll().size();

    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);

    for (int i = 0; i < 3; i++) {
      EdgeDescription description =
          new EdgeDescription(
              new Ref<>(node1.getIdentity()),
              new Ref<>(node2.getIdentity()),
              "source-" + i,
              "target-" + i,
              "ASSOCIATION",
              "edge " + i,
              styleProps);
      diagram.addEdge(description);
    }

    int newSize = diagram.edges().findAll().size();
    assertEquals(initialSize + 3, newSize);
  }

  @Test
  public void should_create_edge_with_label() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "sourceHandle",
            "targetHandle",
            "ASSOCIATION",
            "has many",
            styleProps);
    DiagramEdge savedEdge = diagram.addEdge(description);

    assertEquals("has many", savedEdge.getDescription().label());
  }

  @Test
  public void should_create_edge_with_empty_label() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "sourceHandle",
            "targetHandle",
            "ASSOCIATION",
            "",
            styleProps);
    DiagramEdge savedEdge = diagram.addEdge(description);

    assertEquals("", savedEdge.getDescription().label());
  }

  @Test
  public void should_preserve_eager_loaded_edges_after_cache_hydration() {
    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    EdgeDescription description =
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            "source",
            "target",
            "ASSOCIATION",
            "hydration test",
            styleProps);
    DiagramEdge savedEdge = diagram.addEdge(description);

    User firstUser = users.findByIdentity("1").get();
    Diagram firstDiagram =
        firstUser.projects().findAll().stream()
            .findFirst()
            .get()
            .diagrams()
            .findByIdentity(diagram.getIdentity())
            .get();
    int edgeCount = firstDiagram.edges().findAll().size();
    assertTrue(edgeCount > 0, "Diagram should have at least one edge");

    String edgeId = firstDiagram.edges().findAll().iterator().next().getIdentity();
    String edgeRelation =
        firstDiagram.edges().findByIdentity(edgeId).get().getDescription().relationType();

    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());

    User cachedUser = users.findByIdentity("1").get();
    Diagram cachedDiagram =
        cachedUser.projects().findAll().stream()
            .findFirst()
            .get()
            .diagrams()
            .findByIdentity(diagram.getIdentity())
            .get();

    assertEquals(
        edgeCount,
        cachedDiagram.edges().findAll().size(),
        "Eager-loaded edges should be preserved after cache hydration");

    var cachedEdge = cachedDiagram.edges().findByIdentity(edgeId);
    assertTrue(cachedEdge.isPresent(), "Edge should be found by identity");
    assertEquals(
        edgeRelation,
        cachedEdge.get().getDescription().relationType(),
        "Edge data should be preserved after hydration");
  }
}
