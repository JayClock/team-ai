package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Diagram.Status;
import reengineering.ddd.teamai.model.Diagram.Type;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectDiagramsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private User user;
  private Project project;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findByIdentity("1").get();
    project = user.projects().findAll().stream().findFirst().get();
  }

  @Test
  public void should_get_diagrams_association_of_project() {
    int initialSize = project.diagrams().findAll().size();
    assertEquals(0, initialSize);
  }

  @Test
  public void should_add_diagram_and_return_saved_entity() {
    Viewport viewport = new Viewport(100, 50, 1.5);
    var description = new DiagramDescription("下单流程上下文图", Type.CLASS, viewport);

    Diagram savedDiagram = project.addDiagram(description);

    assertEquals("下单流程上下文图", savedDiagram.getDescription().title());
    assertEquals(Type.CLASS, savedDiagram.getDescription().type());
    assertEquals(Status.DRAFT, savedDiagram.getDescription().status());
    assertEquals(100, savedDiagram.getDescription().viewport().x());
    assertEquals(50, savedDiagram.getDescription().viewport().y());
    assertEquals(1.5, savedDiagram.getDescription().viewport().zoom());

    var retrievedDiagram = project.diagrams().findByIdentity(savedDiagram.getIdentity()).get();
    assertEquals(savedDiagram.getIdentity(), retrievedDiagram.getIdentity());
    assertEquals(savedDiagram.getDescription().title(), retrievedDiagram.getDescription().title());
    assertEquals(savedDiagram.getDescription().type(), retrievedDiagram.getDescription().type());
  }

  @Test
  public void should_find_single_diagram_of_project() {
    Viewport viewport = new Viewport(0, 0, 1);
    var description = new DiagramDescription("会员体系图", Type.SEQUENCE, viewport);
    Diagram savedDiagram = project.addDiagram(description);

    Diagram diagram = project.diagrams().findByIdentity(savedDiagram.getIdentity()).get();
    assertEquals(savedDiagram.getIdentity(), diagram.getIdentity());
    assertEquals("会员体系图", diagram.getDescription().title());
    assertEquals(Type.SEQUENCE, diagram.getDescription().type());
    assertEquals(Status.DRAFT, diagram.getDescription().status());

    var cachedDiagram = project.diagrams().findByIdentity(savedDiagram.getIdentity()).get();
    assertEquals(diagram.getIdentity(), cachedDiagram.getIdentity());
    assertEquals(diagram.getDescription().title(), cachedDiagram.getDescription().title());
  }

  @Test
  public void should_not_find_diagram_by_project_and_id_if_not_exist() {
    assertTrue(project.diagrams().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_get_size_of_diagrams_association() {
    int initialSize = project.diagrams().findAll().size();

    Viewport viewport = Viewport.defaultViewport();
    var description = new DiagramDescription("测试图", Type.FLOWCHART, viewport);
    project.addDiagram(description);

    int newSize = project.diagrams().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_evict_cache_on_add_diagram() {
    int initialSize = project.diagrams().findAll().size();

    Viewport viewport = Viewport.defaultViewport();
    var description = new DiagramDescription("缓存测试图", Type.COMPONENT, viewport);
    project.addDiagram(description);

    int newSize = project.diagrams().findAll().size();
    assertEquals(initialSize + 1, newSize);
  }

  @Test
  public void should_cache_diagram_list_by_range() {
    Viewport viewport = Viewport.defaultViewport();
    for (int i = 0; i < 5; i++) {
      var description =
          new DiagramDescription("图" + i, Type.values()[i % Type.values().length], viewport);
      project.addDiagram(description);
    }

    var firstCall = project.diagrams().findAll().subCollection(0, 3);
    var secondCall = project.diagrams().findAll().subCollection(0, 3);

    assertEquals(firstCall.size(), secondCall.size());
    assertEquals(3, secondCall.size());
  }

  @Test
  public void should_cache_diagram_count() {
    int firstCall = project.diagrams().findAll().size();
    int secondCall = project.diagrams().findAll().size();

    assertEquals(firstCall, secondCall);
  }

  @Test
  public void should_support_all_diagram_types() {
    Viewport viewport = Viewport.defaultViewport();

    Diagram flowchart = project.addDiagram(new DiagramDescription("流程图", Type.FLOWCHART, viewport));
    assertEquals(Type.FLOWCHART, flowchart.getDescription().type());

    Diagram sequence = project.addDiagram(new DiagramDescription("时序图", Type.SEQUENCE, viewport));
    assertEquals(Type.SEQUENCE, sequence.getDescription().type());

    Diagram classDiagram = project.addDiagram(new DiagramDescription("类图", Type.CLASS, viewport));
    assertEquals(Type.CLASS, classDiagram.getDescription().type());

    Diagram component = project.addDiagram(new DiagramDescription("组件图", Type.COMPONENT, viewport));
    assertEquals(Type.COMPONENT, component.getDescription().type());

    Diagram state = project.addDiagram(new DiagramDescription("状态图", Type.STATE, viewport));
    assertEquals(Type.STATE, state.getDescription().type());

    Diagram activity = project.addDiagram(new DiagramDescription("活动图", Type.ACTIVITY, viewport));
    assertEquals(Type.ACTIVITY, activity.getDescription().type());
  }

  @Test
  public void should_create_diagram_with_default_viewport() {
    var description = new DiagramDescription("默认视口图", Type.CLASS, Viewport.defaultViewport());

    Diagram savedDiagram = project.addDiagram(description);

    assertEquals(0, savedDiagram.getDescription().viewport().x());
    assertEquals(0, savedDiagram.getDescription().viewport().y());
    assertEquals(1, savedDiagram.getDescription().viewport().zoom());
  }

  @Test
  public void should_commit_draft_via_project_diagrams_association() {
    Diagram diagram =
        project.addDiagram(
            new DiagramDescription(
                "草稿提交图", Type.CLASS, Viewport.defaultViewport(), Status.PUBLISHED));
    assertEquals(Status.PUBLISHED, diagram.getDescription().status());
    NodeDescription nodeDescription =
        new NodeDescription("class-node", null, null, 100.0, 200.0, 300, 200, null, null);

    project.saveDiagram(
        diagram.getIdentity(),
        List.of(new Project.Diagrams.DraftNode("node-1", nodeDescription)),
        List.of(new Project.Diagrams.DraftEdge("node-1", "node-1")));

    Diagram committed = project.diagrams().findByIdentity(diagram.getIdentity()).orElseThrow();
    assertEquals(1, committed.nodes().findAll().size());
    assertEquals(1, committed.edges().findAll().size());
    assertEquals(Status.DRAFT, committed.getDescription().status());
  }

  @Test
  public void should_update_existing_node_when_saving_draft_via_project_diagrams_association() {
    Diagram diagram =
        project.addDiagram(
            new DiagramDescription("更新节点草稿图", Type.CLASS, Viewport.defaultViewport()));
    diagram.addNode(
        new NodeDescription("old-node", null, null, 100.0, 120.0, 200, 120, null, null));
    DiagramNode existingNode = diagram.nodes().findAll().stream().findFirst().orElseThrow();
    int nodeCountBefore = diagram.nodes().findAll().size();

    project.saveDiagram(
        diagram.getIdentity(),
        List.of(
            new Project.Diagrams.DraftNode(
                existingNode.getIdentity(),
                new NodeDescription(
                    "updated-node", null, null, 520.0, 680.0, 320, 220, null, null))),
        List.of());

    Diagram committed = project.diagrams().findByIdentity(diagram.getIdentity()).orElseThrow();
    assertEquals(nodeCountBefore, committed.nodes().findAll().size());
    DiagramNode updatedNode =
        committed.nodes().findByIdentity(existingNode.getIdentity()).orElseThrow();
    assertEquals("updated-node", updatedNode.getDescription().type());
    assertEquals(520.0, updatedNode.getDescription().positionX());
    assertEquals(680.0, updatedNode.getDescription().positionY());
    assertEquals(Status.DRAFT, committed.getDescription().status());
  }

  @Test
  public void should_delete_missing_existing_nodes_when_saving_full_snapshot() {
    Diagram diagram =
        project.addDiagram(
            new DiagramDescription("全量删除节点草稿图", Type.CLASS, Viewport.defaultViewport()));
    DiagramNode keptNode =
        diagram.addNode(
            new NodeDescription("kept-node", null, null, 100.0, 120.0, 200, 120, null, null));
    DiagramNode removedNode =
        diagram.addNode(
            new NodeDescription("removed-node", null, null, 220.0, 120.0, 200, 120, null, null));

    project.saveDiagram(
        diagram.getIdentity(),
        List.of(
            new Project.Diagrams.DraftNode(
                keptNode.getIdentity(),
                new NodeDescription(
                    "kept-node-updated", null, null, 520.0, 680.0, 320, 220, null, null))),
        List.of());

    Diagram committed = project.diagrams().findByIdentity(diagram.getIdentity()).orElseThrow();
    assertTrue(committed.nodes().findByIdentity(keptNode.getIdentity()).isPresent());
    assertTrue(committed.nodes().findByIdentity(removedNode.getIdentity()).isEmpty());
  }

  @Test
  public void should_rebuild_edges_when_saving_full_snapshot() {
    Diagram diagram =
        project.addDiagram(
            new DiagramDescription("全量重建边草稿图", Type.CLASS, Viewport.defaultViewport()));
    DiagramNode node1 =
        diagram.addNode(
            new NodeDescription("node-1", null, null, 100.0, 120.0, 200, 120, null, null));
    DiagramNode node2 =
        diagram.addNode(
            new NodeDescription("node-2", null, null, 220.0, 120.0, 200, 120, null, null));
    diagram.addEdge(
        new EdgeDescription(
            new Ref<>(node1.getIdentity()),
            new Ref<>(node2.getIdentity()),
            null,
            null,
            null,
            null,
            null));
    diagram.addEdge(
        new EdgeDescription(
            new Ref<>(node2.getIdentity()),
            new Ref<>(node1.getIdentity()),
            null,
            null,
            null,
            null,
            null));
    assertEquals(2, diagram.edges().findAll().size());

    project.saveDiagram(
        diagram.getIdentity(),
        List.of(
            new Project.Diagrams.DraftNode(
                node1.getIdentity(),
                new NodeDescription("node-1", null, null, 100.0, 120.0, 200, 120, null, null)),
            new Project.Diagrams.DraftNode(
                node2.getIdentity(),
                new NodeDescription("node-2", null, null, 220.0, 120.0, 200, 120, null, null))),
        List.of(new Project.Diagrams.DraftEdge(node1.getIdentity(), node2.getIdentity())));

    Diagram committed = project.diagrams().findByIdentity(diagram.getIdentity()).orElseThrow();
    List<DiagramEdge> edgesAfterCommit = committed.edges().findAll().stream().toList();
    assertEquals(1, edgesAfterCommit.size());
    DiagramEdge remainingEdge = edgesAfterCommit.get(0);
    assertEquals(node1.getIdentity(), remainingEdge.getDescription().sourceNode().id());
    assertEquals(node2.getIdentity(), remainingEdge.getDescription().targetNode().id());
  }

  @Test
  public void should_reject_blank_diagram_id_when_saving_draft() {
    Project.Diagrams.InvalidDraftException error =
        assertThrows(
            Project.Diagrams.InvalidDraftException.class,
            () ->
                project.saveDiagram(
                    " ",
                    List.of(new Project.Diagrams.DraftNode("node-1", minimalNodeDescription())),
                    List.of()));

    assertEquals("Diagram id must be provided.", error.getMessage());
  }

  @Test
  public void should_reject_unknown_diagram_when_saving_draft() {
    Project.Diagrams.InvalidDraftException error =
        assertThrows(
            Project.Diagrams.InvalidDraftException.class,
            () ->
                project.saveDiagram(
                    "-1",
                    List.of(new Project.Diagrams.DraftNode("node-1", minimalNodeDescription())),
                    List.of()));

    assertEquals("Diagram not found: -1", error.getMessage());
  }

  @Test
  public void should_publish_diagram_via_project_diagrams_association() {
    Diagram diagram =
        project.addDiagram(new DiagramDescription("发布图", Type.CLASS, Viewport.defaultViewport()));
    assertEquals(Status.DRAFT, diagram.getDescription().status());

    project.publishDiagram(diagram.getIdentity());

    Diagram published = project.diagrams().findByIdentity(diagram.getIdentity()).orElseThrow();
    assertEquals(Status.PUBLISHED, published.getDescription().status());
  }

  @Test
  public void should_create_diagram_version_from_persisted_diagram() {
    Diagram diagram =
        project.addDiagram(new DiagramDescription("版本图", Type.CLASS, Viewport.defaultViewport()));

    DiagramVersion version = diagram.createVersion();

    assertEquals("v1", version.getDescription().name());
    assertEquals(1, diagram.versions().findAll().size());
  }

  private static NodeDescription minimalNodeDescription() {
    return new NodeDescription("class-node", null, null, 100.0, 200.0, 300, 200, null, null);
  }
}
