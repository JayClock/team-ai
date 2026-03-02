package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import jakarta.inject.Inject;
import java.time.Instant;
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
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
class ProjectOrchestrationSessionsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private Project project;

  @BeforeEach
  void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    User user = users.findByIdentity("1").orElseThrow();
    project = user.projects().findAll().stream().findFirst().orElseThrow();
  }

  @Test
  void should_create_and_update_orchestration_session() {
    Agent coordinator =
        project.createAgent(
            new AgentDescription(
                "Routa",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    Agent implementer =
        project.createAgent(
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                new Ref<>(coordinator.getIdentity())));
    Task task =
        project.createTask(
            new TaskDescription(
                "Ship onboarding",
                "Implement orchestration persistence",
                "mybatis",
                List.of("session persists"),
                List.of("./gradlew :backend:persistent:mybatis:test"),
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));

    OrchestrationSession created =
        project.startOrchestrationSession(
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>(coordinator.getIdentity()),
                new Ref<>(implementer.getIdentity()),
                new Ref<>(task.getIdentity()),
                null,
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));

    project.updateOrchestrationSessionStatus(
        created.getIdentity(),
        OrchestrationSessionDescription.Status.COMPLETED,
        null,
        Instant.parse("2026-03-02T12:20:00Z"),
        null);

    OrchestrationSession loaded =
        project.orchestrationSessions().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals(
        OrchestrationSessionDescription.Status.COMPLETED, loaded.getDescription().status());
    assertEquals(Instant.parse("2026-03-02T12:20:00Z"), loaded.getDescription().completedAt());
    assertNotNull(loaded.getDescription().coordinator());
    assertEquals(coordinator.getIdentity(), loaded.getDescription().coordinator().id());
    assertNull(loaded.getDescription().failureReason());
  }
}
