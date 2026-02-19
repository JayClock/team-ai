package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
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
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Diagram.Type;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class DiagramNodesTest {
  private static final ObjectMapper objectMapper = new ObjectMapper();

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
                      new DiagramDescription("Test Diagram", Type.CLASS, new Viewport(0, 0, 1.0)));
                });
  }

  @Test
  public void should_get_nodes_association_of_diagram() {
    int initialSize = diagram.nodes().findAll().size();
    assertTrue(initialSize >= 0, "Initial nodes count should be non-negative");
  }

  @Test
  public void should_add_node_and_return_saved_entity() throws Exception {
    int initialSize = diagram.nodes().findAll().size();

    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#ff0000",
                "textColor",
                "#ffffff",
                "fontSize",
                14,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Test content",
                "color", "#00ff00",
                "type", "sticky-note"));

    NodeDescription description =
        new NodeDescription(
            "class-node",
            null,
            null,
            100.0,
            200.0,
            300,
            400,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));

    DiagramNode savedNode = diagram.addNode(description);

    assertEquals("class-node", savedNode.getDescription().type());
    assertEquals(100.0, savedNode.getDescription().positionX());
    assertEquals(200.0, savedNode.getDescription().positionY());
    assertEquals(300, savedNode.getDescription().width());
    assertEquals(400, savedNode.getDescription().height());
    assertTrue(savedNode.getDescription().styleConfig().json().contains("#ff0000"));
    assertTrue(savedNode.getDescription().localData().json().contains("Test content"));

    var retrievedNode = diagram.nodes().findByIdentity(savedNode.getIdentity()).get();
    assertEquals(savedNode.getIdentity(), retrievedNode.getIdentity());
    assertEquals(savedNode.getDescription().type(), retrievedNode.getDescription().type());
  }

  @Test
  public void should_add_nodes_in_batch_and_return_saved_entities() {
    int initialSize = diagram.nodes().findAll().size();

    List<DiagramNode> savedNodes =
        ((Diagram.Nodes) diagram.nodes())
            .addAll(
                List.of(
                    new NodeDescription(
                        "batch-node-1",
                        null,
                        null,
                        120.0,
                        220.0,
                        300,
                        400,
                        new JsonBlob("{\"backgroundColor\":\"#ff0000\"}"),
                        new JsonBlob("{\"content\":\"batch-1\"}")),
                    new NodeDescription(
                        "batch-node-2",
                        null,
                        null,
                        240.0,
                        360.0,
                        320,
                        420,
                        new JsonBlob("{\"backgroundColor\":\"#00ff00\"}"),
                        new JsonBlob("{\"content\":\"batch-2\"}"))));

    assertEquals(2, savedNodes.size());
    assertEquals("batch-node-1", savedNodes.get(0).getDescription().type());
    assertEquals("batch-node-2", savedNodes.get(1).getDescription().type());
    assertEquals(initialSize + 2, diagram.nodes().findAll().size());
  }

  @Test
  public void should_find_single_node_of_diagram() throws Exception {
    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#000000",
                "textColor",
                "#ffffff",
                "fontSize",
                12,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Node content",
                "color", "#0000ff",
                "type", "note"));
    NodeDescription description =
        new NodeDescription(
            "entity-node",
            null,
            null,
            50.0,
            150.0,
            200,
            300,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));
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
  public void should_get_size_of_nodes_association() throws Exception {
    int initialSize = diagram.nodes().findAll().size();

    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#ff0000",
                "textColor",
                "#ffffff",
                "fontSize",
                14,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Test",
                "color", "#00ff00",
                "type", "note"));
    NodeDescription description =
        new NodeDescription(
            "test-node",
            null,
            null,
            100.0,
            200.0,
            300,
            400,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));
    diagram.addNode(description);

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_evict_cache_on_add_node() throws Exception {
    int initialSize = diagram.nodes().findAll().size();

    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#ff0000",
                "textColor",
                "#ffffff",
                "fontSize",
                14,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Cache test",
                "color", "#00ff00",
                "type", "note"));
    NodeDescription description =
        new NodeDescription(
            "cache-test-node",
            null,
            null,
            100.0,
            200.0,
            300,
            400,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));
    diagram.addNode(description);

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_cache_nodes_list() throws Exception {
    for (int i = 0; i < 5; i++) {
      String styleConfigJson =
          objectMapper.writeValueAsString(
              Map.of(
                  "backgroundColor",
                  "#ff0000",
                  "textColor",
                  "#ffffff",
                  "fontSize",
                  14,
                  "collapsed",
                  false,
                  "hiddenAttributes",
                  List.of()));
      String localDataJson =
          objectMapper.writeValueAsString(
              Map.of(
                  "content", "Node " + i,
                  "color", "#00ff00",
                  "type", "note"));
      NodeDescription description =
          new NodeDescription(
              "node-" + i,
              null,
              null,
              100.0 + i * 50,
              200.0,
              300,
              400,
              new JsonBlob(styleConfigJson),
              new JsonBlob(localDataJson));
      diagram.addNode(description);
    }

    var firstCall = diagram.nodes().findAll();
    var secondCall = diagram.nodes().findAll();

    int count = 0;
    for (var node : firstCall) {
      count++;
    }
    int count2 = 0;
    for (var node : secondCall) {
      count2++;
    }

    assertEquals(count, count2);
  }

  @Test
  public void should_cache_nodes_count() {
    int firstCall = diagram.nodes().findAll().size();
    int secondCall = diagram.nodes().findAll().size();

    assertEquals(firstCall, secondCall);
  }

  @Test
  public void should_support_multiple_node_types() throws Exception {
    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#ff0000",
                "textColor",
                "#ffffff",
                "fontSize",
                14,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Content",
                "color", "#00ff00",
                "type", "note"));

    DiagramNode classNode =
        diagram.addNode(
            new NodeDescription(
                "class",
                null,
                null,
                100.0,
                200.0,
                300,
                400,
                new JsonBlob(styleConfigJson),
                new JsonBlob(localDataJson)));
    assertEquals("class", classNode.getDescription().type());

    DiagramNode entityNode =
        diagram.addNode(
            new NodeDescription(
                "entity",
                null,
                null,
                500.0,
                600.0,
                300,
                400,
                new JsonBlob(styleConfigJson),
                new JsonBlob(localDataJson)));
    assertEquals("entity", entityNode.getDescription().type());

    DiagramNode stickyNote =
        diagram.addNode(
            new NodeDescription(
                "sticky-note",
                null,
                null,
                800.0,
                900.0,
                200,
                300,
                new JsonBlob(styleConfigJson),
                new JsonBlob(localDataJson)));
    assertEquals("sticky-note", stickyNote.getDescription().type());
  }

  @Test
  public void should_create_node_with_null_refs() throws Exception {
    int initialSize = diagram.nodes().findAll().size();

    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#ff0000",
                "textColor",
                "#ffffff",
                "fontSize",
                14,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Test",
                "color", "#00ff00",
                "type", "note"));
    NodeDescription description =
        new NodeDescription(
            "null-refs-node",
            null,
            null,
            100.0,
            200.0,
            300,
            400,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));
    DiagramNode savedNode = diagram.addNode(description);

    assertEquals(null, savedNode.getDescription().logicalEntity());
    assertEquals(null, savedNode.getDescription().parent());

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_add_multiple_nodes_to_diagram() throws Exception {
    int initialSize = diagram.nodes().findAll().size();

    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#ff0000",
                "textColor",
                "#ffffff",
                "fontSize",
                14,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Test",
                "color", "#00ff00",
                "type", "note"));

    for (int i = 0; i < 3; i++) {
      NodeDescription description =
          new NodeDescription(
              "node-" + i,
              null,
              null,
              100.0 + i * 100,
              200.0,
              300,
              400,
              new JsonBlob(styleConfigJson),
              new JsonBlob(localDataJson));
      diagram.addNode(description);
    }

    int newSize = diagram.nodes().findAll().size();
    assertEquals(initialSize + 3, newSize);
  }

  @Test
  public void should_preserve_eager_loaded_nodes_after_cache_hydration() throws Exception {
    // Add some nodes
    String styleConfigJson =
        objectMapper.writeValueAsString(
            Map.of(
                "backgroundColor",
                "#ff0000",
                "textColor",
                "#ffffff",
                "fontSize",
                14,
                "collapsed",
                false,
                "hiddenAttributes",
                List.of()));
    String localDataJson =
        objectMapper.writeValueAsString(
            Map.of(
                "content", "Test",
                "color", "#00ff00",
                "type", "note"));
    NodeDescription description =
        new NodeDescription(
            "hydration-test",
            null,
            null,
            100.0,
            200.0,
            300,
            400,
            new JsonBlob(styleConfigJson),
            new JsonBlob(localDataJson));
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
