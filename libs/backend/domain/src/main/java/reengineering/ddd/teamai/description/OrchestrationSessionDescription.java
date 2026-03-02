package reengineering.ddd.teamai.description;

import java.time.Instant;
import reengineering.ddd.archtype.Ref;

public record OrchestrationSessionDescription(
    String goal,
    Status status,
    Ref<String> coordinator,
    Ref<String> implementer,
    Ref<String> task,
    Ref<String> currentStep,
    Instant startedAt,
    Instant completedAt,
    String failureReason) {

  public enum Status {
    PENDING,
    RUNNING,
    REVIEW_REQUIRED,
    COMPLETED,
    FAILED,
    CANCELLED
  }
}
