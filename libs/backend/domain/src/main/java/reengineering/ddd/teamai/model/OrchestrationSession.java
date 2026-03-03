package reengineering.ddd.teamai.model;

import static reengineering.ddd.teamai.validation.DomainValidation.requireRef;
import static reengineering.ddd.teamai.validation.DomainValidation.requireText;

import java.time.Instant;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;

public class OrchestrationSession implements Entity<String, OrchestrationSessionDescription> {
  private String identity;
  private OrchestrationSessionDescription description;

  public OrchestrationSession(String identity, OrchestrationSessionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public OrchestrationSession() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public OrchestrationSessionDescription getDescription() {
    return description;
  }

  public void markRunning(Instant startedAt) {
    requireStatus("mark running", OrchestrationSessionDescription.Status.PENDING);
    description =
        new OrchestrationSessionDescription(
            description.goal(),
            OrchestrationSessionDescription.Status.RUNNING,
            description.coordinator(),
            description.implementer(),
            description.task(),
            description.spec(),
            description.currentStep(),
            defaultTime(startedAt),
            null,
            null);
  }

  public void markReviewRequired(Ref<String> currentStep) {
    requireStatus("mark review required", OrchestrationSessionDescription.Status.RUNNING);
    requireRef(currentStep, "currentStep");
    description =
        new OrchestrationSessionDescription(
            description.goal(),
            OrchestrationSessionDescription.Status.REVIEW_REQUIRED,
            description.coordinator(),
            description.implementer(),
            description.task(),
            description.spec(),
            currentStep,
            description.startedAt(),
            null,
            null);
  }

  public void markCompleted(Instant completedAt) {
    requireStatus(
        "mark completed",
        OrchestrationSessionDescription.Status.RUNNING,
        OrchestrationSessionDescription.Status.REVIEW_REQUIRED);
    description =
        new OrchestrationSessionDescription(
            description.goal(),
            OrchestrationSessionDescription.Status.COMPLETED,
            description.coordinator(),
            description.implementer(),
            description.task(),
            description.spec(),
            description.currentStep(),
            description.startedAt(),
            defaultTime(completedAt),
            null);
  }

  public void markFailed(String reason, Instant completedAt) {
    requireStatus(
        "mark failed",
        OrchestrationSessionDescription.Status.RUNNING,
        OrchestrationSessionDescription.Status.REVIEW_REQUIRED);
    requireText(reason, "reason");
    description =
        new OrchestrationSessionDescription(
            description.goal(),
            OrchestrationSessionDescription.Status.FAILED,
            description.coordinator(),
            description.implementer(),
            description.task(),
            description.spec(),
            description.currentStep(),
            description.startedAt(),
            defaultTime(completedAt),
            reason);
  }

  public void cancel(String reason, Instant completedAt) {
    requireStatus(
        "cancel",
        OrchestrationSessionDescription.Status.PENDING,
        OrchestrationSessionDescription.Status.RUNNING,
        OrchestrationSessionDescription.Status.REVIEW_REQUIRED);
    requireText(reason, "reason");
    description =
        new OrchestrationSessionDescription(
            description.goal(),
            OrchestrationSessionDescription.Status.CANCELLED,
            description.coordinator(),
            description.implementer(),
            description.task(),
            description.spec(),
            description.currentStep(),
            description.startedAt(),
            defaultTime(completedAt),
            reason);
  }

  private void requireStatus(
      String operation,
      OrchestrationSessionDescription.Status expected,
      OrchestrationSessionDescription.Status... additionallyAllowed) {
    OrchestrationSessionDescription.Status current = description.status();
    if (current == expected) {
      return;
    }
    for (OrchestrationSessionDescription.Status status : additionallyAllowed) {
      if (current == status) {
        return;
      }
    }
    throw new IllegalStateException(
        "Cannot " + operation + " when session is " + current + ". Allowed: " + expected);
  }

  private Instant defaultTime(Instant time) {
    return time == null ? Instant.now() : time;
  }
}
