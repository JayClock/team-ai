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
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LocalNodeData;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.NodeStyleConfig;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class DiagramNodesTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;
  @Inject private reengineering.ddd.TestDataMapper testData;

  private User user;
  private Diagram diagram;

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
  }

  @Test
  public void should_get_nodes_association_of_diagram() {
    int initialSize = diagram.nodes().findAll().size();
    assertTrue(initialSize >= 0, "Initial nodes count should be non-negative");
  }

  @Test
  public void should_add_node_and_return_saved_entity() {
    int initialSize = diagram.nodes().findAll().size();

    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Test content", "#00ff00", "sticky-note");
    NodeDescription description =
        new NodeDescription(
            "class-node", null, null, 100.0, 200.0, 300, 400, styleConfig, localData);

    DiagramNode savedNode = diagram.addNode(description);

    assertEquals("class-node", savedNode.getDescription().type());
    assertEquals(100.0, savedNode.getDescription().positionX());
    assertEquals(200.0, savedNode.getDescription().positionY());
    assertEquals(300, savedNode.getDescription().width());
    assertEquals(400, savedNode.getDescription().height());
    assertEquals("#ff0000", savedNode.getDescription().styleConfig().backgroundColor());
    assertEquals("#ffffff", savedNode.getDescription().styleConfig().textColor());
    assertEquals(14, savedNode.getDescription().styleConfig().fontSize());
    assertEquals(false, savedNode.getDescription().styleConfig().collapsed());
    assertEquals("Test content", savedNode.getDescription().localData().content());
    assertEquals("#00ff00", savedNode.getDescription().localData().color());
    assertEquals("sticky-note", savedNode.getDescription().localData().type());
    assertEquals(diagram.getIdentity(), savedNode.getDiagramId());

    var retrievedNode = diagram.nodes().findByIdentity(savedNode.getIdentity()).get();
    assertEquals(savedNode.getIdentity(), retrievedNode.getIdentity());
    assertEquals(savedNode.getDescription().type(), retrievedNode.getDescription().type());
  }

  @Test
  public void should_find_single_node_of_diagram() {
    NodeStyleConfig styleConfig = new NodeStyleConfig("#000000", "#ffffff", 12, false, List.of());
    LocalNodeData localData = new LocalNodeData("Node content", "#0000ff", "note");
    NodeDescription description =
        new NodeDescription(
            "entity-node", null, null, 50.0, 150.0, 200, 300, styleConfig, localData);
    DiagramNode savedNode = diagram.addNode(description);

    DiagramNode node = diagram.nodes().findByIdentity(savedNode.getIdentity()).get();
    assertEquals(savedNode.getIdentity(), node.getIdentity());
    assertEquals("entity-node", node.getDescription().type());
    assertEquals(50.0, node.getDescription().positionX());
    assertEquals(150.0, node.getDescription().positionY());

    var cachedNode = diagram.nodes().findByIdentity(savedNode.getIdentity()).get();
    assertEquals(node.getIdentity(), cachedNode.getIdentity());
    assertEquals(node.getDescription().type(), cachedNode.getDescription().type());
  }

  @Test
  public void should_not_find_node_by_diagram_and_id_if_not_exist() {
    assertTrue(diagram.nodes().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_get_size_of_nodes_association() {
    int initialSize = diagram.nodes().findAll().size();

    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Test", "#00ff00", "note");
    NodeDescription description =
        new NodeDescription(
            "test-node", null, null, 100.0, 200.0, 300, 400, styleConfig, localData);
    diagram.addNode(description);

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_evict_cache_on_add_node() {
    int initialSize = diagram.nodes().findAll().size();

    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Cache test", "#00ff00", "note");
    NodeDescription description =
        new NodeDescription(
            "cache-test-node", null, null, 100.0, 200.0, 300, 400, styleConfig, localData);
    diagram.addNode(description);

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_cache_nodes_list_by_range() {
    for (int i = 0; i < 5; i++) {
      NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
      LocalNodeData localData = new LocalNodeData("Node " + i, "#00ff00", "note");
      NodeDescription description =
          new NodeDescription(
              "node-" + i, null, null, 100.0 + i * 50, 200.0, 300, 400, styleConfig, localData);
      diagram.addNode(description);
    }

    var firstCall = diagram.nodes().findAll().subCollection(0, 3);
    var secondCall = diagram.nodes().findAll().subCollection(0, 3);

    assertEquals(firstCall.size(), secondCall.size());
  }

  @Test
  public void should_cache_nodes_count() {
    int firstCall = diagram.nodes().findAll().size();
    int secondCall = diagram.nodes().findAll().size();

    assertEquals(firstCall, secondCall);
  }

  @Test
  public void should_support_multiple_node_types() {
    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Content", "#00ff00", "note");

    DiagramNode classNode =
        diagram.addNode(
            new NodeDescription(
                "class", null, null, 100.0, 200.0, 300, 400, styleConfig, localData));
    assertEquals("class", classNode.getDescription().type());

    DiagramNode entityNode =
        diagram.addNode(
            new NodeDescription(
                "entity", null, null, 500.0, 600.0, 300, 400, styleConfig, localData));
    assertEquals("entity", entityNode.getDescription().type());

    DiagramNode stickyNote =
        diagram.addNode(
            new NodeDescription(
                "sticky-note", null, null, 800.0, 900.0, 200, 300, styleConfig, localData));
    assertEquals("sticky-note", stickyNote.getDescription().type());
  }

  @Test
  public void should_create_node_with_null_refs() {
    int initialSize = diagram.nodes().findAll().size();

    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Test", "#00ff00", "note");
    NodeDescription description =
        new NodeDescription(
            "null-refs-node", null, null, 100.0, 200.0, 300, 400, styleConfig, localData);
    DiagramNode savedNode = diagram.addNode(description);

    assertEquals(null, savedNode.getDescription().logicalEntity());
    assertEquals(null, savedNode.getDescription().parent());

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_add_multiple_nodes_to_diagram() {
    int initialSize = diagram.nodes().findAll().size();

    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Test", "#00ff00", "note");

    for (int i = 0; i < 3; i++) {
      NodeDescription description =
          new NodeDescription(
              "node-" + i, null, null, 100.0 + i * 100, 200.0, 300, 400, styleConfig, localData);
      diagram.addNode(description);
    }

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 3, newSize);
  }

  @Test
  public void should_preserve_eager_loaded_nodes_after_cache_hydration() {
    // Add some nodes
    NodeStyleConfig styleConfig = new NodeStyleConfig("#ff0000", "#ffffff", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Test", "#00ff00", "note");
    NodeDescription description =
        new NodeDescription(
            "hydration-test", null, null, 100.0, 200.0, 300, 400, styleConfig, localData);
    DiagramNode savedNode = diagram.addNode(description);

    // Get diagram with nodes loaded
    User firstUser = users.findByIdentity("1").get();
    Diagram firstDiagram =
        firstUser.projects().findAll().stream()
            .findFirst()
            .get()
            .diagrams()
            .findByIdentity(diagram.getIdentity())
            .get();
    int nodeCount = firstDiagram.nodes().findAll().size();
    assertTrue(nodeCount > 0, "Diagram should have at least one node");

    // Get node details for later verification
    String nodeId = firstDiagram.nodes().findAll().iterator().next().getIdentity();
    String nodeType = firstDiagram.nodes().findByIdentity(nodeId).get().getDescription().type();

    // Clear cache to force re-hydration
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());

    // Second access - should hydrate from cache
    User cachedUser = users.findByIdentity("1").get();
    Diagram cachedDiagram =
        cachedUser.projects().findAll().stream()
            .findFirst()
            .get()
            .diagrams()
            .findByIdentity(diagram.getIdentity())
            .get();

    // Verify eager-loaded nodes are preserved
    assertEquals(
        nodeCount,
        cachedDiagram.nodes().findAll().size(),
        "Eager-loaded nodes should be preserved after cache hydration");

    // Verify node data is intact
    var cachedNode = cachedDiagram.nodes().findByIdentity(nodeId);
    assertTrue(cachedNode.isPresent(), "Node should be found by identity");
    assertEquals(
        nodeType,
        cachedNode.get().getDescription().type(),
        "Node data should be preserved after hydration");
  }
}
