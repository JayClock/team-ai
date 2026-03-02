package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;

class OrchestrationSessionTest {

  @Test
  void should_mark_running_then_review_required_then_completed() {
    OrchestrationSession session =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.PENDING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                null,
                null,
                null));

    Instant startedAt = Instant.parse("2026-03-02T12:00:00Z");
    Instant completedAt = Instant.parse("2026-03-02T12:10:00Z");

    session.markRunning(startedAt);
    session.markReviewRequired(new Ref<>("step-review"));
    session.markCompleted(completedAt);

    assertEquals(
        OrchestrationSessionDescription.Status.COMPLETED, session.getDescription().status());
    assertEquals(startedAt, session.getDescription().startedAt());
    assertEquals(completedAt, session.getDescription().completedAt());
    assertEquals("step-review", session.getDescription().currentStep().id());
  }

  @Test
  void should_fail_with_reason() {
    OrchestrationSession session =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.RUNNING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                new Ref<>("step-impl"),
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));

    Instant completedAt = Instant.parse("2026-03-02T12:05:00Z");
    session.markFailed("Command timeout", completedAt);

    assertEquals(OrchestrationSessionDescription.Status.FAILED, session.getDescription().status());
    assertEquals("Command timeout", session.getDescription().failureReason());
    assertEquals(completedAt, session.getDescription().completedAt());
  }

  @Test
  void should_reject_invalid_transition() {
    OrchestrationSession session =
        new OrchestrationSession(
            "session-1",
            new OrchestrationSessionDescription(
                "Ship onboarding",
                OrchestrationSessionDescription.Status.PENDING,
                new Ref<>("agent-routa"),
                new Ref<>("agent-crafter"),
                new Ref<>("task-1"),
                null,
                null,
                null,
                null));

    IllegalStateException error =
        assertThrows(
            IllegalStateException.class,
            () -> session.markCompleted(Instant.parse("2026-03-02T12:10:00Z")));

    assertTrue(error.getMessage().contains("Cannot mark completed"));
  }
}
