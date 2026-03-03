package reengineering.ddd.teamai.model;

import java.time.Instant;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.OrchestrationStepDescription;

public class OrchestrationStep implements Entity<String, OrchestrationStepDescription> {
  private String identity;
  private OrchestrationStepDescription description;

  public OrchestrationStep(String identity, OrchestrationStepDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public OrchestrationStep() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public OrchestrationStepDescription getDescription() {
    return description;
  }

  public void start(Instant startedAt) {
    requireStatus("start", OrchestrationStepDescription.Status.PENDING);
    description =
        new OrchestrationStepDescription(
            description.title(),
            description.objective(),
            OrchestrationStepDescription.Status.RUNNING,
            description.task(),
            description.assignee(),
            defaultTime(startedAt),
            null,
            null);
  }

  public void complete(Instant completedAt) {
    requireStatus(
        "complete",
        OrchestrationStepDescription.Status.RUNNING,
        OrchestrationStepDescription.Status.REVIEW_REQUIRED);
    description =
        new OrchestrationStepDescription(
            description.title(),
            description.objective(),
            OrchestrationStepDescription.Status.COMPLETED,
            description.task(),
            description.assignee(),
            description.startedAt(),
            defaultTime(completedAt),
            null);
  }

  public void markReviewRequired() {
    requireStatus("mark review required", OrchestrationStepDescription.Status.RUNNING);
    description =
        new OrchestrationStepDescription(
            description.title(),
            description.objective(),
            OrchestrationStepDescription.Status.REVIEW_REQUIRED,
            description.task(),
            description.assignee(),
            description.startedAt(),
            null,
            null);
  }

  public void fail(String reason, Instant completedAt) {
    requireStatus(
        "fail",
        OrchestrationStepDescription.Status.RUNNING,
        OrchestrationStepDescription.Status.REVIEW_REQUIRED);
    requireText(reason, "reason");
    description =
        new OrchestrationStepDescription(
            description.title(),
            description.objective(),
            OrchestrationStepDescription.Status.FAILED,
            description.task(),
            description.assignee(),
            description.startedAt(),
            defaultTime(completedAt),
            reason);
  }

  public void cancel(String reason, Instant completedAt) {
    requireStatus(
        "cancel",
        OrchestrationStepDescription.Status.PENDING,
        OrchestrationStepDescription.Status.RUNNING,
        OrchestrationStepDescription.Status.REVIEW_REQUIRED);
    requireText(reason, "reason");
    description =
        new OrchestrationStepDescription(
            description.title(),
            description.objective(),
            OrchestrationStepDescription.Status.CANCELLED,
            description.task(),
            description.assignee(),
            description.startedAt(),
            defaultTime(completedAt),
            reason);
  }

  private void requireText(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
  }

  private void requireStatus(
      String operation,
      OrchestrationStepDescription.Status expected,
      OrchestrationStepDescription.Status... additionallyAllowed) {
    OrchestrationStepDescription.Status current = description.status();
    if (current == expected) {
      return;
    }
    for (OrchestrationStepDescription.Status status : additionallyAllowed) {
      if (current == status) {
        return;
      }
    }
    throw new IllegalStateException(
        "Cannot " + operation + " when step is " + current + ". Allowed: " + expected);
  }

  private Instant defaultTime(Instant time) {
    return time == null ? Instant.now() : time;
  }
}
