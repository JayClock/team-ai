package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
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
import reengineering.ddd.teamai.model.Diagram.Type;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class DiagramVersionsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private User user;
  private Project project;
  private Diagram diagram;

  @BeforeEach
  void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findByIdentity("1").orElseThrow();
    project = user.projects().findAll().stream().findFirst().orElseThrow();
    diagram =
        project.addDiagram(new DiagramDescription("版本测试图", Type.CLASS, Viewport.defaultViewport()));
  }

  @Test
  void should_get_versions_association_of_diagram() {
    assertNotNull(diagram.versions());
    assertEquals(0, diagram.versions().findAll().size());
  }

  @Test
  void should_create_version_and_persist_snapshot() {
    var source =
        diagram.addNode(
            new NodeDescription("class-node", null, null, 100.0, 200.0, 300, 200, null, null));
    var target =
        diagram.addNode(
            new NodeDescription("class-node", null, null, 400.0, 200.0, 300, 200, null, null));
    diagram.addEdge(
        new EdgeDescription(
            new Ref<>(source.getIdentity()),
            new Ref<>(target.getIdentity()),
            null,
            null,
            "ASSOCIATION",
            "connects",
            null));

    DiagramVersion version = diagram.createVersion();

    assertNotNull(version);
    assertEquals("v1", version.getDescription().name());
    assertEquals(2, version.getDescription().snapshot().nodes().size());
    assertEquals(1, version.getDescription().snapshot().edges().size());
    assertEquals(0, version.getDescription().snapshot().viewport().x());
    assertEquals(0, version.getDescription().snapshot().viewport().y());
    assertEquals(1, version.getDescription().snapshot().viewport().zoom());

    DiagramVersion persisted =
        diagram.versions().findByIdentity(version.getIdentity()).orElseThrow();
    assertEquals("v1", persisted.getDescription().name());
    assertEquals(2, persisted.getDescription().snapshot().nodes().size());
    assertEquals(1, persisted.getDescription().snapshot().edges().size());
  }

  @Test
  void should_increment_version_name_on_subsequent_snapshots() {
    DiagramVersion first = diagram.createVersion();
    DiagramVersion second = diagram.createVersion();

    assertEquals("v1", first.getDescription().name());
    assertEquals("v2", second.getDescription().name());
    assertTrue(diagram.versions().findAll().size() >= 2);
  }
}
