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
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class UserProjectsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private User user;
  private final String userId = "1";
  private final int projectCount = 5;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
  }

  @Test
  public void should_get_projects_association_of_user() {
    User user = users.findById(userId).get();
    assertEquals(projectCount, user.projects().findAll().size());

    var firstResult = user.projects().findAll();
    var secondResult = user.projects().findAll();
    assertEquals(firstResult.size(), secondResult.size());
    assertEquals(projectCount, secondResult.size());
  }

  @Test
  public void should_find_project_by_user_and_id() {
    User user = users.findById(userId).get();
    String identity = user.projects().findAll().iterator().next().getIdentity();
    assertEquals(identity, user.projects().findByIdentity(identity).get().getIdentity());

    var cachedProject = user.projects().findByIdentity(identity).get();
    assertEquals(identity, cachedProject.getIdentity());
  }

  @Test
  public void should_not_find_project_by_user_and_id_if_not_exist() {
    User user = users.findById(userId).get();
    assertTrue(user.projects().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_add_project_and_return_saved_project() {
    User user = users.findById(userId).get();
    var description = new ProjectDescription("New Project", "New Model");
    Project savedProject = user.add(description);

    assertNotNull(savedProject.getDescription().name());
    assertNotNull(savedProject.getDescription().domainModel());

    var retrievedProject = user.projects().findByIdentity(savedProject.getIdentity()).get();
    assertEquals(savedProject.getIdentity(), retrievedProject.getIdentity());
    assertEquals(savedProject.getDescription().name(), retrievedProject.getDescription().name());
    assertEquals(
        savedProject.getDescription().domainModel(),
        retrievedProject.getDescription().domainModel());
  }

  @Test
  public void should_delete_project() {
    User user = users.findById(userId).get();
    var description = new ProjectDescription("Project to Delete", "Model");
    Project savedProject = user.add(description);

    assertTrue(user.projects().findByIdentity(savedProject.getIdentity()).isPresent());

    user.deleteProject(savedProject.getIdentity());
    assertTrue(user.projects().findByIdentity(savedProject.getIdentity()).isEmpty());
  }

  @Test
  public void should_preserve_eager_loaded_projects_after_cache_hydration() {
    User firstUser = users.findById(userId).get();
    int projectsCount = firstUser.projects().findAll().size();
    assertTrue(projectsCount > 0, "User should have at least one project");

    String projectId = firstUser.projects().findAll().iterator().next().getIdentity();
    assertNotNull(firstUser.projects().findByIdentity(projectId).get().getDescription().name());

    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());

    User cachedUser = users.findById(userId).get();

    assertEquals(
        projectsCount,
        cachedUser.projects().findAll().size(),
        "Eager-loaded projects should be preserved after cache hydration");

    var cachedProject = cachedUser.projects().findByIdentity(projectId);
    assertTrue(cachedProject.isPresent(), "Project should be found by identity");
    assertNotNull(
        cachedProject.get().getDescription().name(),
        "Project data should be preserved after hydration");
  }
}
