package reengineering.ddd.teamai.mybatis.acp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.teamai.model.AcpSessionEvent;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAcpSessionEventsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
class PostgresAcpSessionEventStoreTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectAcpSessionEventsMapper eventsMapper;
  @Inject private ObjectMapper objectMapper;

  private PostgresAcpSessionEventStore store;
  private final int userId = id();
  private final int projectId = id();
  private final int sessionId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  void before() {
    store = new PostgresAcpSessionEventStore(eventsMapper, objectMapper);
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
  void should_append_and_query_events_with_cursor_and_limit() {
    store.append(
        project(),
        event(
            "evt-1",
            "status",
            Map.of("state", "RUNNING"),
            null,
            Instant.parse("2026-03-03T10:00:01Z")));
    store.append(
        project(),
        event(
            "evt-2",
            "delta",
            Map.of("content", "runtime output"),
            null,
            Instant.parse("2026-03-03T10:00:02Z")));
    store.append(
        project(),
        event(
            "evt-3",
            "error",
            Map.of("category", "provider"),
            new AcpSessionEvent.Error("PROVIDER_FAILURE", "provider failed", true, 1500),
            Instant.parse("2026-03-03T10:00:03Z")));

    List<AcpSessionEvent> all = store.findBySession(project(), session(), null, 10);
    assertEquals(3, all.size());
    assertEquals("evt-1", all.get(0).eventId());
    assertEquals("evt-2", all.get(1).eventId());
    assertEquals("evt-3", all.get(2).eventId());
    assertEquals("runtime output", all.get(1).data().get("content"));
    assertNotNull(all.get(2).error());
    assertEquals("PROVIDER_FAILURE", all.get(2).error().code());
    assertEquals("provider failed", all.get(2).error().message());
    assertEquals(true, all.get(2).error().retryable());
    assertEquals(1500L, all.get(2).error().retryAfterMs());

    List<AcpSessionEvent> afterFirst = store.findBySession(project(), session(), "evt-1", 10);
    assertEquals(2, afterFirst.size());
    assertEquals("evt-2", afterFirst.get(0).eventId());
    assertEquals("evt-3", afterFirst.get(1).eventId());

    List<AcpSessionEvent> limited = store.findBySession(project(), session(), null, 1);
    assertEquals(1, limited.size());
    assertEquals("evt-1", limited.get(0).eventId());
  }

  @Test
  void should_ignore_duplicate_event_append_by_event_id() {
    AcpSessionEvent duplicate =
        event(
            "evt-dup",
            "status",
            Map.of("state", "RUNNING"),
            null,
            Instant.parse("2026-03-03T10:00:01Z"));

    store.append(project(), duplicate);
    store.append(project(), duplicate);

    List<AcpSessionEvent> all = store.findBySession(project(), session(), null, 10);
    assertEquals(1, all.size());
    assertEquals("evt-dup", all.get(0).eventId());
    assertNull(all.get(0).error());
  }

  private AcpSessionEvent event(
      String eventId,
      String eventType,
      Map<String, Object> data,
      AcpSessionEvent.Error error,
      Instant emittedAt) {
    return new AcpSessionEvent(eventId, session(), eventType, emittedAt, data, error);
  }

  private String project() {
    return String.valueOf(projectId);
  }

  private String session() {
    return String.valueOf(sessionId);
  }
}
