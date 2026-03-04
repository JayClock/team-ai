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
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAcpSessionsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
class ProjectAcpSessionsMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectAcpSessionsMapper sessionsMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int sessionId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project " + projectId);
    testData.insertProjectAcpSession(
        sessionId,
        projectId,
        userId,
        "codex",
        "default",
        "RUNNING",
        Instant.parse("2026-03-03T10:00:00Z"),
        Instant.parse("2026-03-03T10:01:00Z"),
        null,
        null,
        "evt-1");
    testData.insertProjectAcpSession(
        sessionId + 1,
        projectId,
        userId,
        "codex",
        "default",
        "COMPLETED",
        Instant.parse("2026-03-03T10:00:00Z"),
        Instant.parse("2026-03-03T10:02:00Z"),
        Instant.parse("2026-03-03T10:03:00Z"),
        null,
        "evt-2");
  }

  @Test
  void should_find_session_by_project_and_id() {
    AcpSession session = sessionsMapper.findSessionByProjectAndId(projectId, sessionId);

    assertEquals(String.valueOf(sessionId), session.getIdentity());
    assertEquals(AcpSessionDescription.Status.RUNNING, session.getDescription().status());
    assertEquals("codex", session.getDescription().provider());
    assertEquals("default", session.getDescription().mode());
    assertEquals(String.valueOf(userId), session.getDescription().actor().id());
    assertEquals("evt-1", session.getDescription().lastEventId().id());
  }

  @Test
  void should_insert_update_touch_bind_and_count() {
    IdHolder holder = new IdHolder();
    AcpSessionDescription description =
        new AcpSessionDescription(
            new Ref<>(String.valueOf(projectId)),
            new Ref<>(String.valueOf(userId)),
            "codex",
            "debug",
            AcpSessionDescription.Status.PENDING,
            Instant.parse("2026-03-03T11:00:00Z"),
            Instant.parse("2026-03-03T11:00:00Z"),
            null,
            null,
            null,
            new Ref<>(String.valueOf(sessionId)));

    sessionsMapper.insertSession(holder, projectId, description);
    sessionsMapper.touchSession(projectId, holder.id(), Instant.parse("2026-03-03T11:05:00Z"));
    sessionsMapper.bindLastEventId(projectId, holder.id(), "evt-new");
    sessionsMapper.updateSessionStatus(
        projectId,
        holder.id(),
        AcpSessionDescription.Status.FAILED,
        Instant.parse("2026-03-03T11:06:00Z"),
        "runtime failed");

    AcpSession saved = sessionsMapper.findSessionByProjectAndId(projectId, holder.id());
    assertEquals(AcpSessionDescription.Status.FAILED, saved.getDescription().status());
    assertEquals("runtime failed", saved.getDescription().failureReason());
    assertEquals(Instant.parse("2026-03-03T11:05:00Z"), saved.getDescription().lastActivityAt());
    assertEquals("evt-new", saved.getDescription().lastEventId().id());
    assertEquals(String.valueOf(sessionId), saved.getDescription().parentSession().id());

    int count = sessionsMapper.countSessionsByProject(projectId);
    assertEquals(3, count);

    List<AcpSession> list = sessionsMapper.findSessionsByProjectId(projectId, 0, 10);
    assertEquals(3, list.size());
    assertNotNull(list.get(0).getDescription().project());
  }
}
