package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.OrchestrationStepDescription;

class OrchestrationStepTest {

  @Test
  void should_start_and_complete_step() {
    OrchestrationStep step =
        new OrchestrationStep(
            "step-1",
            new OrchestrationStepDescription(
                "Implement API",
                "Build endpoint",
                OrchestrationStepDescription.Status.PENDING,
                new Ref<>("task-1"),
                new Ref<>("agent-crafter"),
                null,
                null,
                null));

    Instant startedAt = Instant.parse("2026-03-02T12:00:00Z");
    Instant completedAt = Instant.parse("2026-03-02T12:15:00Z");

    step.start(startedAt);
    step.complete(completedAt);

    assertEquals(OrchestrationStepDescription.Status.COMPLETED, step.getDescription().status());
    assertEquals(startedAt, step.getDescription().startedAt());
    assertEquals(completedAt, step.getDescription().completedAt());
  }

  @Test
  void should_cancel_pending_step() {
    OrchestrationStep step =
        new OrchestrationStep(
            "step-1",
            new OrchestrationStepDescription(
                "Implement API",
                "Build endpoint",
                OrchestrationStepDescription.Status.PENDING,
                new Ref<>("task-1"),
                new Ref<>("agent-crafter"),
                null,
                null,
                null));

    step.cancel("Session cancelled", Instant.parse("2026-03-02T12:02:00Z"));

    assertEquals(OrchestrationStepDescription.Status.CANCELLED, step.getDescription().status());
    assertEquals("Session cancelled", step.getDescription().failureReason());
  }

  @Test
  void should_reject_complete_before_start() {
    OrchestrationStep step =
        new OrchestrationStep(
            "step-1",
            new OrchestrationStepDescription(
                "Implement API",
                "Build endpoint",
                OrchestrationStepDescription.Status.PENDING,
                new Ref<>("task-1"),
                new Ref<>("agent-crafter"),
                null,
                null,
                null));

    IllegalStateException error =
        assertThrows(
            IllegalStateException.class,
            () -> step.complete(Instant.parse("2026-03-02T12:15:00Z")));

    assertTrue(error.getMessage().contains("Cannot complete"));
  }

  @Test
  void should_require_reason_on_fail() {
    OrchestrationStep step =
        new OrchestrationStep(
            "step-1",
            new OrchestrationStepDescription(
                "Implement API",
                "Build endpoint",
                OrchestrationStepDescription.Status.RUNNING,
                new Ref<>("task-1"),
                new Ref<>("agent-crafter"),
                Instant.parse("2026-03-02T12:00:00Z"),
                null,
                null));

    IllegalArgumentException error =
        assertThrows(
            IllegalArgumentException.class,
            () -> step.fail("   ", Instant.parse("2026-03-02T12:15:00Z")));

    assertTrue(error.getMessage().contains("reason must not be blank"));
  }
}
