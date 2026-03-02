package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

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
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.mybatis.mappers.ProjectOrchestrationSessionsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
class ProjectOrchestrationSessionsMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectOrchestrationSessionsMapper sessionsMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int coordinatorId = id();
  private final int implementerId = id();
  private final int taskId = id();
  private final int sessionId = id();
  private final int stepId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project " + projectId);
    testData.insertProjectAgent(
        coordinatorId, projectId, "Routa", "ROUTA", "SMART", "ACTIVE", null);
    testData.insertProjectAgent(
        implementerId, projectId, "Crafter", "CRAFTER", "BALANCED", "PENDING", coordinatorId);
    testData.insertProjectTask(
        taskId,
        projectId,
        "Ship onboarding",
        "Implement orchestration persistence",
        "mybatis",
        "[\"session stored\"]",
        "[\"./gradlew :backend:persistent:mybatis:test\"]",
        "IN_PROGRESS",
        implementerId,
        coordinatorId,
        null,
        null,
        null);
    testData.insertProjectOrchestrationSession(
        sessionId,
        projectId,
        "Ship onboarding",
        "RUNNING",
        coordinatorId,
        implementerId,
        taskId,
        null,
        Instant.parse("2026-03-02T12:00:00Z"),
        null,
        null);
    testData.insertProjectOrchestrationStep(
        stepId,
        sessionId,
        1,
        "Implement",
        "Write persistence mapper",
        "RUNNING",
        taskId,
        implementerId,
        Instant.parse("2026-03-02T12:01:00Z"),
        null,
        null);
    testData.insertProjectOrchestrationSession(
        sessionId + 1,
        projectId,
        "Ship onboarding",
        "REVIEW_REQUIRED",
        coordinatorId,
        implementerId,
        taskId,
        stepId,
        Instant.parse("2026-03-02T12:00:00Z"),
        null,
        null);
  }

  @Test
  void should_find_session_by_project_and_id() {
    OrchestrationSession session =
        sessionsMapper.findSessionByProjectAndId(projectId, sessionId + 1);

    assertEquals(String.valueOf(sessionId + 1), session.getIdentity());
    assertEquals(
        OrchestrationSessionDescription.Status.REVIEW_REQUIRED, session.getDescription().status());
    assertEquals(String.valueOf(coordinatorId), session.getDescription().coordinator().id());
    assertEquals(String.valueOf(implementerId), session.getDescription().implementer().id());
    assertEquals(String.valueOf(taskId), session.getDescription().task().id());
    assertEquals(String.valueOf(stepId), session.getDescription().currentStep().id());
  }

  @Test
  void should_insert_update_and_count_sessions() {
    IdHolder holder = new IdHolder();
    OrchestrationSessionDescription description =
        new OrchestrationSessionDescription(
            "Deliver feature",
            OrchestrationSessionDescription.Status.PENDING,
            new Ref<>(String.valueOf(coordinatorId)),
            new Ref<>(String.valueOf(implementerId)),
            new Ref<>(String.valueOf(taskId)),
            null,
            null,
            null,
            null);

    sessionsMapper.insertSession(holder, projectId, description);
    sessionsMapper.updateSessionStatus(
        projectId,
        holder.id(),
        OrchestrationSessionDescription.Status.COMPLETED,
        null,
        Instant.parse("2026-03-02T12:30:00Z"),
        null);

    OrchestrationSession saved = sessionsMapper.findSessionByProjectAndId(projectId, holder.id());
    assertEquals(OrchestrationSessionDescription.Status.COMPLETED, saved.getDescription().status());
    assertEquals(Instant.parse("2026-03-02T12:30:00Z"), saved.getDescription().completedAt());
    assertNull(saved.getDescription().failureReason());

    int count = sessionsMapper.countSessionsByProject(projectId);
    assertEquals(3, count);

    List<OrchestrationSession> list = sessionsMapper.findSessionsByProjectId(projectId, 0, 10);
    assertEquals(3, list.size());
  }
}
