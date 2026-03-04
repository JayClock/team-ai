package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AcpSessionDescription;

class AcpSessionTest {

  @Test
  void should_normalize_session_name() {
    AcpSession session =
        new AcpSession(
            "acp-session-1",
            "  Initial Session  ",
            new AcpSessionDescription(
                new Ref<>("project-1"),
                new Ref<>("user-1"),
                "codex",
                "default",
                AcpSessionDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null,
                new Ref<>("acp-parent-1")));

    session.rename("  Refined Session Name  ");

    assertEquals("Refined Session Name", session.getName());
  }

  @Test
  void should_mark_running_touch_bind_event_and_complete() {
    AcpSession session =
        new AcpSession(
            "acp-session-1",
            new AcpSessionDescription(
                new Ref<>("project-1"),
                new Ref<>("user-1"),
                "codex",
                "default",
                AcpSessionDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null,
                new Ref<>("acp-parent-1")));

    Instant startedAt = Instant.parse("2026-03-03T10:00:00Z");
    Instant touchedAt = Instant.parse("2026-03-03T10:01:00Z");
    Instant completedAt = Instant.parse("2026-03-03T10:02:00Z");

    session.markRunning(startedAt);
    session.touch(touchedAt);
    session.bindLastEventId("evt-100");
    session.markCompleted(completedAt);

    assertEquals(AcpSessionDescription.Status.COMPLETED, session.getDescription().status());
    assertEquals(startedAt, session.getDescription().startedAt());
    assertEquals(touchedAt, session.getDescription().lastActivityAt());
    assertEquals(completedAt, session.getDescription().completedAt());
    assertEquals("evt-100", session.getDescription().lastEventId().id());
    assertEquals("acp-parent-1", session.getDescription().parentSession().id());
  }

  @Test
  void should_cancel_with_reason() {
    AcpSession session =
        new AcpSession(
            "acp-session-1",
            new AcpSessionDescription(
                new Ref<>("project-1"),
                new Ref<>("user-1"),
                "codex",
                "default",
                AcpSessionDescription.Status.RUNNING,
                Instant.parse("2026-03-03T10:00:00Z"),
                Instant.parse("2026-03-03T10:00:30Z"),
                null,
                null,
                null,
                null));

    Instant completedAt = Instant.parse("2026-03-03T10:01:00Z");
    session.cancel("cancelled by user", completedAt);

    assertEquals(AcpSessionDescription.Status.CANCELLED, session.getDescription().status());
    assertEquals(completedAt, session.getDescription().completedAt());
    assertEquals("cancelled by user", session.getDescription().failureReason());
  }

  @Test
  void should_reject_invalid_transition() {
    AcpSession session =
        new AcpSession(
            "acp-session-1",
            new AcpSessionDescription(
                new Ref<>("project-1"),
                new Ref<>("user-1"),
                "codex",
                "default",
                AcpSessionDescription.Status.COMPLETED,
                Instant.parse("2026-03-03T10:00:00Z"),
                Instant.parse("2026-03-03T10:01:00Z"),
                Instant.parse("2026-03-03T10:02:00Z"),
                null,
                new Ref<>("evt-100"),
                null));

    IllegalStateException error =
        assertThrows(
            IllegalStateException.class,
            () -> session.markRunning(Instant.parse("2026-03-03T10:03:00Z")));

    assertTrue(error.getMessage().contains("Cannot mark running"));
  }

  @Test
  void should_reject_blank_name_on_rename() {
    AcpSession session =
        new AcpSession(
            "acp-session-1",
            new AcpSessionDescription(
                new Ref<>("project-1"),
                new Ref<>("user-1"),
                "codex",
                "default",
                AcpSessionDescription.Status.PENDING,
                null,
                null,
                null,
                null,
                null,
                null));

    IllegalArgumentException error =
        assertThrows(IllegalArgumentException.class, () -> session.rename(" "));

    assertEquals("name must not be blank", error.getMessage());
  }
}
