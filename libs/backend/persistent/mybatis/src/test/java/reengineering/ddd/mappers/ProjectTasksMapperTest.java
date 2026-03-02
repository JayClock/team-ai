package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.inject.Inject;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskReportDescription;
import reengineering.ddd.teamai.model.Task;
import reengineering.ddd.teamai.mybatis.mappers.ProjectTasksMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectTasksMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectTasksMapper tasksMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int parentAgentId = id();
  private final int agentId = id();
  private final int taskId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertProjectAgent(
        parentAgentId, projectId, "Routa", "ROUTA", "SMART", "ACTIVE", null);
    testData.insertProjectAgent(
        agentId, projectId, "Crafter", "CRAFTER", "BALANCED", "ACTIVE", parentAgentId);
    testData.insertProjectTask(
        taskId,
        projectId,
        "Implement persistence",
        "Persist task lifecycle",
        "domain + mybatis",
        "[\"create table\",\"add mapper\"]",
        "[\"./gradlew :backend:persistent:mybatis:test\"]",
        "PENDING",
        agentId,
        parentAgentId,
        null,
        null,
        null);
  }

  @Test
  void should_find_task_by_project_and_id() {
    Task task = tasksMapper.findTaskByProjectAndId(projectId, taskId);

    assertEquals(String.valueOf(taskId), task.getIdentity());
    assertEquals("Implement persistence", task.getDescription().title());
    assertEquals(TaskDescription.Status.PENDING, task.getDescription().status());
    assertEquals(List.of("create table", "add mapper"), task.getDescription().acceptanceCriteria());
    assertEquals(
        List.of("./gradlew :backend:persistent:mybatis:test"),
        task.getDescription().verificationCommands());
    assertNotNull(task.getDescription().assignedTo());
    assertEquals(String.valueOf(agentId), task.getDescription().assignedTo().id());
  }

  @Test
  void should_insert_task_to_database() {
    IdHolder holder = new IdHolder();
    TaskDescription description =
        new TaskDescription(
            "Implement tests",
            "Cover agent/task/event persistence",
            "mapper + association",
            List.of("mapper tests", "association tests"),
            List.of("./gradlew :backend:persistent:mybatis:test"),
            TaskDescription.Status.IN_PROGRESS,
            new Ref<>(String.valueOf(agentId)),
            new Ref<>(String.valueOf(parentAgentId)),
            null,
            null,
            null);

    tasksMapper.insertTask(holder, projectId, description);

    Task saved = tasksMapper.findTaskByProjectAndId(projectId, holder.id());
    assertEquals("Implement tests", saved.getDescription().title());
    assertEquals(TaskDescription.Status.IN_PROGRESS, saved.getDescription().status());
    assertEquals(2, saved.getDescription().acceptanceCriteria().size());
  }

  @Test
  void should_update_task_assignment() {
    tasksMapper.updateTaskAssignment(
        projectId,
        taskId,
        new Ref<>(String.valueOf(parentAgentId)),
        new Ref<>(String.valueOf(agentId)));

    Task updated = tasksMapper.findTaskByProjectAndId(projectId, taskId);
    assertEquals(String.valueOf(parentAgentId), updated.getDescription().assignedTo().id());
    assertEquals(String.valueOf(agentId), updated.getDescription().delegatedBy().id());
  }

  @Test
  void should_update_task_status_and_completion_summary() {
    tasksMapper.updateTaskStatus(
        projectId, taskId, TaskDescription.Status.REVIEW_REQUIRED, "waiting for gate");

    Task updated = tasksMapper.findTaskByProjectAndId(projectId, taskId);
    assertEquals(TaskDescription.Status.REVIEW_REQUIRED, updated.getDescription().status());
    assertEquals("waiting for gate", updated.getDescription().completionSummary());
  }

  @Test
  void should_update_task_report() {
    tasksMapper.updateTaskReport(
        projectId,
        taskId,
        new Ref<>(String.valueOf(agentId)),
        new TaskReportDescription("done", true, "all checks passed"));

    Task updated = tasksMapper.findTaskByProjectAndId(projectId, taskId);
    assertEquals(String.valueOf(agentId), updated.getDescription().assignedTo().id());
    assertEquals(
        TaskDescription.VerificationVerdict.APPROVED,
        updated.getDescription().verificationVerdict());
    assertEquals("all checks passed", updated.getDescription().verificationReport());
    assertEquals("done", updated.getDescription().completionSummary());
  }

  @Test
  void should_count_and_list_tasks_by_project() {
    int count = tasksMapper.countTasksByProject(projectId);
    assertEquals(1, count);

    List<Task> list = tasksMapper.findTasksByProjectId(projectId, 0, 10);
    assertEquals(1, list.size());
  }
}
