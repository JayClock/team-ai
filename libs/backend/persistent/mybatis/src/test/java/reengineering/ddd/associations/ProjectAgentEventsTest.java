package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectAgentEventsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private Project project;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    User user = users.findByIdentity("1").get();
    project = user.projects().findAll().stream().findFirst().get();
  }

  @Test
  void should_append_and_read_events() {
    Agent agent =
        project.createAgent(
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    Task task =
        project.createTask(
            new TaskDescription(
                "Implement event stream",
                "Store event log",
                "mybatis",
                List.of("append"),
                List.of("read"),
                TaskDescription.Status.PENDING,
                new Ref<>(agent.getIdentity()),
                null,
                null,
                null,
                null));

    AgentEvent created =
        project.appendEvent(
            new AgentEventDescription(
                AgentEventDescription.Type.TASK_ASSIGNED,
                new Ref<>(agent.getIdentity()),
                new Ref<>(task.getIdentity()),
                "Task assigned",
                Instant.parse("2026-01-03T00:00:00Z")));

    AgentEvent loaded = project.events().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals(AgentEventDescription.Type.TASK_ASSIGNED, loaded.getDescription().type());
    assertEquals(String.valueOf(agent.getIdentity()), loaded.getDescription().agent().id());
    assertEquals(String.valueOf(task.getIdentity()), loaded.getDescription().task().id());
    assertEquals("Task assigned", loaded.getDescription().message());
    assertEquals(Instant.parse("2026-01-03T00:00:00Z"), loaded.getDescription().occurredAt());
  }
}
