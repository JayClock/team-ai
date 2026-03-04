package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
import reengineering.ddd.teamai.mybatis.mappers.ProjectAcpSessionEventRow;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAcpSessionEventsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
class ProjectAcpSessionEventsMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectAcpSessionEventsMapper eventsMapper;

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
        "evt-bootstrap");
  }

  @Test
  void should_insert_and_query_events_by_cursor_and_limit() {
    eventsMapper.insertEvent(projectId, sessionId, row("evt-1", "status", "{}", null));
    eventsMapper.insertEvent(
        projectId, sessionId, row("evt-2", "delta", "{\"content\":\"a\"}", null));
    eventsMapper.insertEvent(
        projectId, sessionId, row("evt-3", "complete", "{\"reason\":\"done\"}", null));

    List<ProjectAcpSessionEventRow> all =
        eventsMapper.findEventsBySession(projectId, sessionId, null, 10);
    assertEquals(3, all.size());
    assertEquals("evt-1", all.get(0).getEventId());
    assertEquals("evt-2", all.get(1).getEventId());
    assertEquals("evt-3", all.get(2).getEventId());

    List<ProjectAcpSessionEventRow> afterFirst =
        eventsMapper.findEventsBySession(projectId, sessionId, "evt-1", 10);
    assertEquals(2, afterFirst.size());
    assertEquals("evt-2", afterFirst.get(0).getEventId());
    assertEquals("evt-3", afterFirst.get(1).getEventId());

    List<ProjectAcpSessionEventRow> limited =
        eventsMapper.findEventsBySession(projectId, sessionId, "evt-1", 1);
    assertEquals(1, limited.size());
    assertEquals("evt-2", limited.get(0).getEventId());

    List<ProjectAcpSessionEventRow> missingCursor =
        eventsMapper.findEventsBySession(projectId, sessionId, "evt-missing", 10);
    assertEquals(3, missingCursor.size());
  }

  private ProjectAcpSessionEventRow row(
      String eventId, String eventType, String dataJson, String errorJson) {
    ProjectAcpSessionEventRow row = new ProjectAcpSessionEventRow();
    row.setSessionId(sessionId);
    row.setEventId(eventId);
    row.setEventType(eventType);
    row.setEmittedAt(Instant.parse("2026-03-03T10:00:00Z"));
    row.setDataJson(dataJson);
    row.setErrorJson(errorJson);
    return row;
  }
}
