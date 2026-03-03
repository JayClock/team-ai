package reengineering.ddd.teamai.description;

import java.time.Instant;
import reengineering.ddd.archtype.Ref;

public record OrchestrationStepDescription(
    String title,
    String objective,
    Status status,
    Ref<String> task,
    Ref<String> assignee,
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
