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
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.mybatis.associations.Projects;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectsTest {
  @Inject private Projects projects;
  @Inject private CacheManager cacheManager;

  private Project project;
  private final String projectId = "1";

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    project = projects.findByIdentity(projectId).get();
  }

  @Test
  public void should_find_project_by_id() {
    assertEquals(projectId, project.getIdentity());
    assertEquals("name", project.getDescription().name());

    Project cachedProject = projects.findByIdentity(projectId).get();
    assertEquals(project.getIdentity(), cachedProject.getIdentity());
    assertEquals(project.getDescription().name(), cachedProject.getDescription().name());
  }

  @Test
  public void should_not_find_project_if_not_exist() {
    assertTrue(projects.findByIdentity("-1").isEmpty());
  }
}
