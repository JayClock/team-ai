package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectBizDiagramsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private User user;
  private Project project;
  private final String userId = "1";
  private final int bizDiagramCount = 100;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findById(userId).get();
    project = user.projects().findAll().stream().findFirst().get();
  }

  @Test
  public void should_get_bizDiagrams_association_of_project() {
    assertEquals(bizDiagramCount, project.bizDiagrams().findAll().size());

    var firstResult = project.bizDiagrams().findAll();
    var secondResult = project.bizDiagrams().findAll();
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(bizDiagramCount, secondResult.size());
  }

  @Test
  public void should_sub_bizDiagrams_association_of_project() {
    assertEquals(40, project.bizDiagrams().findAll().subCollection(0, 40).size());

    var firstResult = project.bizDiagrams().findAll().subCollection(0, 40);
    var secondResult = project.bizDiagrams().findAll().subCollection(0, 40);
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(40, secondResult.size());
  }

  @Test
  public void should_find_single_bizDiagram_of_project() {
    String identity = project.bizDiagrams().findAll().iterator().next().getIdentity();
    BizDiagram bizDiagram = project.bizDiagrams().findByIdentity(identity).get();
    assertEquals(identity, bizDiagram.getIdentity());

    var cachedBizDiagram = project.bizDiagrams().findByIdentity(identity).get();
    assertEquals(bizDiagram.getIdentity(), cachedBizDiagram.getIdentity());
    assertEquals(bizDiagram.getDescription().name(), cachedBizDiagram.getDescription().name());
  }

  @Test
  public void should_not_find_bizDiagram_by_project_and_id_if_not_exist() {
    assertTrue(project.bizDiagrams().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_get_size_of_bizDiagrams_association() {
    assertEquals(bizDiagramCount, project.bizDiagrams().findAll().size());

    var cachedSize = project.bizDiagrams().findAll().size();
    assertEquals(bizDiagramCount, cachedSize);
  }

  @Test
  public void should_iterate_bizDiagrams_of_project() {
    int count = 0;
    for (var bizDiagram : project.bizDiagrams().findAll()) {
      count++;
    }
    assertEquals(bizDiagramCount, count);
  }

  @Test
  public void should_add_bizDiagram_and_return_saved_bizDiagram() {
    var description =
        new BizDiagramDescription(
            "New Diagram", "New description", "@startuml\nnew\n@enduml", DiagramType.SEQUENCE);
    BizDiagram savedBizDiagram = project.addBizDiagram(description);

    assertEquals("New Diagram", savedBizDiagram.getDescription().name());

    var retrievedBizDiagram =
        project.bizDiagrams().findByIdentity(savedBizDiagram.getIdentity()).get();
    assertEquals(savedBizDiagram.getIdentity(), retrievedBizDiagram.getIdentity());
    assertEquals(
        savedBizDiagram.getDescription().name(), retrievedBizDiagram.getDescription().name());
  }

  @Test
  public void should_add_bizDiagram_via_project_method_and_return_saved_bizDiagram() {
    var description =
        new BizDiagramDescription(
            "New Diagram", "New description", "@startuml\nnew\n@enduml", DiagramType.SEQUENCE);
    BizDiagram savedBizDiagram = project.addBizDiagram(description);

    assertEquals("New Diagram", savedBizDiagram.getDescription().name());

    var retrievedBizDiagram =
        project.bizDiagrams().findByIdentity(savedBizDiagram.getIdentity()).get();
    assertEquals(savedBizDiagram.getIdentity(), retrievedBizDiagram.getIdentity());
    assertEquals(
        savedBizDiagram.getDescription().name(), retrievedBizDiagram.getDescription().name());
  }

  @Test
  public void should_cache_bizDiagram_list_by_range() {
    var firstCall = project.bizDiagrams().findAll().subCollection(0, 20);
    var secondCall = project.bizDiagrams().findAll().subCollection(0, 20);

    assertEquals(firstCall.size(), secondCall.size());
    assertEquals(20, secondCall.size());
  }

  @Test
  public void should_cache_bizDiagram_count() {
    int firstCall = project.bizDiagrams().findAll().size();
    int secondCall = project.bizDiagrams().findAll().size();

    assertEquals(firstCall, secondCall);
    assertEquals(bizDiagramCount, secondCall);
  }

  @Test
  public void should_evict_cache_on_add_bizDiagram() {
    int initialSize = project.bizDiagrams().findAll().size();
    assertEquals(bizDiagramCount, initialSize);

    var description =
        new BizDiagramDescription(
            "New Diagram", "New description", "@startuml\nnew\n@enduml", DiagramType.SEQUENCE);
    project.addBizDiagram(description);

    int newSize = project.bizDiagrams().findAll().size();
    assertEquals(bizDiagramCount + 1, newSize);
  }

  @Test
  public void should_evict_cache_on_add_bizDiagram_via_project_method() {
    int initialSize = project.bizDiagrams().findAll().size();
    assertEquals(bizDiagramCount, initialSize);

    var description =
        new BizDiagramDescription(
            "New Diagram", "New description", "@startuml\nnew\n@enduml", DiagramType.SEQUENCE);
    project.addBizDiagram(description);

    int newSize = project.bizDiagrams().findAll().size();
    assertEquals(bizDiagramCount + 1, newSize);
  }

  @Test
  public void should_delete_bizDiagram() {
    String bizDiagramId = project.bizDiagrams().findAll().iterator().next().getIdentity();
    int initialSize = project.bizDiagrams().findAll().size();

    project.deleteBizDiagram(bizDiagramId);

    int newSize = project.bizDiagrams().findAll().size();
    assertEquals(initialSize - 1, newSize);

    assertTrue(project.bizDiagrams().findByIdentity(bizDiagramId).isEmpty());
  }

  @Test
  public void should_evict_cache_on_delete_bizDiagram() {
    String bizDiagramId = project.bizDiagrams().findAll().iterator().next().getIdentity();
    int initialSize = project.bizDiagrams().findAll().size();

    var cachedBizDiagram = project.bizDiagrams().findByIdentity(bizDiagramId);
    assertTrue(cachedBizDiagram.isPresent());

    project.deleteBizDiagram(bizDiagramId);

    assertTrue(project.bizDiagrams().findByIdentity(bizDiagramId).isEmpty());

    int newSize = project.bizDiagrams().findAll().size();
    assertEquals(initialSize - 1, newSize);
  }
}
