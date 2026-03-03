package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.inject.Inject;
import java.time.Instant;
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
import reengineering.ddd.teamai.description.OrchestrationStepDescription;
import reengineering.ddd.teamai.model.OrchestrationStep;
import reengineering.ddd.teamai.mybatis.mappers.ProjectOrchestrationStepsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
class ProjectOrchestrationStepsMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectOrchestrationStepsMapper stepsMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int coordinatorId = id();
  private final int implementerId = id();
  private final int taskId = id();
  private final int sessionId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project " + projectId);
    testData.insertProjectAgent(
        coordinatorId, projectId, "Coordinator", "ROUTA", "SMART", "ACTIVE", null);
    testData.insertProjectAgent(
        implementerId, projectId, "Crafter", "CRAFTER", "BALANCED", "PENDING", coordinatorId);
    testData.insertProjectTask(
        taskId,
        projectId,
        "Ship orchestration",
        "Implement step scheduler",
        "backend",
        "[\"three steps\"]",
        "[\"./gradlew :backend:api:test\"]",
        "IN_PROGRESS",
        implementerId,
        coordinatorId,
        null,
        null,
        null);
    testData.insertProjectOrchestrationSession(
        sessionId,
        projectId,
        "Ship orchestration",
        "RUNNING",
        coordinatorId,
        implementerId,
        taskId,
        null,
        Instant.parse("2026-03-02T12:00:00Z"),
        null,
        null);
  }

  @Test
  void should_insert_steps_and_keep_sequence_order() {
    IdHolder second = new IdHolder();
    IdHolder first = new IdHolder();

    stepsMapper.insertStep(
        second,
        projectId,
        sessionId,
        2,
        new OrchestrationStepDescription(
            "Implement",
            "Deliver implementation",
            OrchestrationStepDescription.Status.PENDING,
            new Ref<>(String.valueOf(taskId)),
            new Ref<>(String.valueOf(implementerId)),
            null,
            null,
            null));
    stepsMapper.insertStep(
        first,
        projectId,
        sessionId,
        1,
        new OrchestrationStepDescription(
            "Clarify",
            "Define boundaries",
            OrchestrationStepDescription.Status.PENDING,
            new Ref<>(String.valueOf(taskId)),
            new Ref<>(String.valueOf(implementerId)),
            null,
            null,
            null));

    List<OrchestrationStep> steps =
        stepsMapper.findStepsByProjectAndSessionId(projectId, sessionId);

    assertEquals(2, steps.size());
    assertEquals("Clarify", steps.get(0).getDescription().title());
    assertEquals("Implement", steps.get(1).getDescription().title());
    assertEquals(String.valueOf(taskId), steps.get(0).getDescription().task().id());
  }

  @Test
  void should_update_step_status_and_find_next_pending_step() {
    IdHolder one = new IdHolder();
    IdHolder two = new IdHolder();
    IdHolder three = new IdHolder();

    stepsMapper.insertStep(
        one,
        projectId,
        sessionId,
        1,
        new OrchestrationStepDescription(
            "Clarify",
            "Define boundaries",
            OrchestrationStepDescription.Status.PENDING,
            new Ref<>(String.valueOf(taskId)),
            new Ref<>(String.valueOf(implementerId)),
            null,
            null,
            null));
    stepsMapper.insertStep(
        two,
        projectId,
        sessionId,
        2,
        new OrchestrationStepDescription(
            "Implement",
            "Build solution",
            OrchestrationStepDescription.Status.PENDING,
            new Ref<>(String.valueOf(taskId)),
            new Ref<>(String.valueOf(implementerId)),
            null,
            null,
            null));
    stepsMapper.insertStep(
        three,
        projectId,
        sessionId,
        3,
        new OrchestrationStepDescription(
            "Validate",
            "Run checks",
            OrchestrationStepDescription.Status.PENDING,
            new Ref<>(String.valueOf(taskId)),
            new Ref<>(String.valueOf(implementerId)),
            null,
            null,
            null));

    stepsMapper.updateStepStatus(
        projectId,
        sessionId,
        one.id(),
        OrchestrationStepDescription.Status.RUNNING,
        Instant.parse("2026-03-02T12:05:00Z"),
        null,
        null);
    stepsMapper.updateStepStatus(
        projectId,
        sessionId,
        one.id(),
        OrchestrationStepDescription.Status.COMPLETED,
        null,
        Instant.parse("2026-03-02T12:08:00Z"),
        null);

    OrchestrationStep first =
        stepsMapper.findStepByProjectSessionAndId(projectId, sessionId, one.id());
    OrchestrationStep nextPending =
        stepsMapper.findNextPendingStepByProjectAndSessionId(projectId, sessionId);

    assertNotNull(first);
    assertEquals(OrchestrationStepDescription.Status.COMPLETED, first.getDescription().status());
    assertEquals(
        Instant.parse("2026-03-02T12:05:00Z"),
        first.getDescription().startedAt(),
        "startedAt should be retained after status updates");
    assertNotNull(nextPending);
    assertEquals(String.valueOf(two.id()), nextPending.getIdentity());
  }
}
