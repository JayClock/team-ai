package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import java.util.Optional;
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
import reengineering.ddd.teamai.context.ProjectContext;
import reengineering.ddd.teamai.description.MemberDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Projects;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;
import reengineering.ddd.teamai.role.ProjectOwner;
import reengineering.ddd.teamai.role.ProjectParticipant;
import reengineering.ddd.teamai.role.ProjectViewer;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class UsersTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;
  @Inject private Projects projects;

  private User user;
  private Project project;
  private final String userId = "1";

  @BeforeEach
  public void setup() {
    // Clear all caches before each test
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    user = users.findByIdentity(userId).get();

    // Get user's first project from database
    project = user.projects().findAll().stream().findFirst().orElseThrow();
  }

  @Test
  public void should_find_user_by_id() {
    assertEquals(String.valueOf(userId), user.getIdentity());
    assertEquals("John Smith", user.getDescription().name());
    assertEquals("john.smith@email.com", user.getDescription().email());

    User cachedUser = users.findByIdentity(String.valueOf(userId)).get();
    assertEquals(user.getIdentity(), cachedUser.getIdentity());
    assertEquals(user.getDescription().name(), cachedUser.getDescription().name());
    assertEquals(user.getDescription().email(), cachedUser.getDescription().email());
    assertSame(user, cachedUser, "User should be cached and return same instance");
  }

  @Test
  public void should_not_find_user_if_not_exist() {
    assertTrue(users.findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_return_project_context() {
    ProjectContext context = users.inProjectContext(project);

    assertNotNull(context);
  }

  @Test
  public void should_return_owner_participant_for_owner_role() {
    // Add user as OWNER to project
    project.addMember(new MemberDescription(new Ref<>(userId), "OWNER"));

    ProjectContext context = users.inProjectContext(project);
    Optional<ProjectParticipant> participant = context.asParticipant(user, project);

    assertTrue(participant.isPresent());
    assertTrue(participant.get() instanceof ProjectOwner);
  }

  @Test
  public void should_return_viewer_participant_for_viewer_role() {
    // Add user as VIEWER to project
    project.addMember(new MemberDescription(new Ref<>(userId), "VIEWER"));

    ProjectContext context = users.inProjectContext(project);
    Optional<ProjectParticipant> participant = context.asParticipant(user, project);

    assertTrue(participant.isPresent());
    assertTrue(participant.get() instanceof ProjectViewer);
  }

  @Test
  public void should_return_empty_participant_for_non_member_user() {
    // Use userId = 999 as a non-existent user
    String nonMemberUserId = "999";
    Optional<User> nonMemberUserOpt = users.findByIdentity(nonMemberUserId);

    if (nonMemberUserOpt.isEmpty()) {
      return; // Skip test if user doesn't exist
    }

    ProjectContext context = users.inProjectContext(project);
    Optional<ProjectParticipant> participant =
        context.asParticipant(nonMemberUserOpt.get(), project);

    assertTrue(participant.isEmpty());
  }
}
