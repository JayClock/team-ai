package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectTasksTest {
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
  void should_create_delegate_update_and_report_task() {
    Agent parent =
        project.createAgent(
            new AgentDescription(
                "Routa",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.ACTIVE,
                null));
    Agent crafter =
        project.createAgent(
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "BALANCED",
                AgentDescription.Status.ACTIVE,
                new Ref<>(parent.getIdentity())));

    Task created =
        project.createTask(
            new TaskDescription(
                "Implement mapper",
                "Persist lifecycle",
                "mybatis",
                List.of("insert", "update"),
                List.of("./gradlew :backend:persistent:mybatis:test"),
                TaskDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null));

    project.delegateTask(
        created.getIdentity(), new Ref<>(crafter.getIdentity()), new Ref<>(parent.getIdentity()));
    project.updateTaskStatus(
        created.getIdentity(), TaskDescription.Status.REVIEW_REQUIRED, "ready for review");
    project.reportTask(
        created.getIdentity(),
        new Ref<>(crafter.getIdentity()),
        new TaskReportDescription("done", true, "all checks passed"));

    Task loaded = project.tasks().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals(String.valueOf(crafter.getIdentity()), loaded.getDescription().assignedTo().id());
    assertEquals(String.valueOf(parent.getIdentity()), loaded.getDescription().delegatedBy().id());
    assertEquals(TaskDescription.Status.REVIEW_REQUIRED, loaded.getDescription().status());
    assertEquals(
        TaskDescription.VerificationVerdict.APPROVED,
        loaded.getDescription().verificationVerdict());
    assertEquals("all checks passed", loaded.getDescription().verificationReport());
    assertEquals("done", loaded.getDescription().completionSummary());
  }
}
