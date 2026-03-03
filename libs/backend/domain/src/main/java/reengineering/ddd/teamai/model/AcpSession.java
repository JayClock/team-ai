package reengineering.ddd.teamai.model;

import java.time.Instant;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.AcpSessionDescription;

public class AcpSession implements Entity<String, AcpSessionDescription> {
  private String identity;
  private AcpSessionDescription description;

  public AcpSession(String identity, AcpSessionDescription description) {
    this.identity = identity;
    this.description = description;
  }

  public AcpSession() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public AcpSessionDescription getDescription() {
    return description;
  }

  public void markRunning(Instant startedAt) {
    requireStatus("mark running", AcpSessionDescription.Status.PENDING);
    Instant eventTime = defaultTime(startedAt);
    description =
        new AcpSessionDescription(
            description.project(),
            description.actor(),
            description.provider(),
            description.mode(),
            AcpSessionDescription.Status.RUNNING,
            eventTime,
            eventTime,
            null,
            null,
            description.lastEventId());
  }

  public void touch(Instant lastActivityAt) {
    if (description.status().isTerminal()) {
      throw new IllegalStateException(
          "Cannot touch session when status is " + description.status());
    }
    description =
        new AcpSessionDescription(
            description.project(),
            description.actor(),
            description.provider(),
            description.mode(),
            description.status(),
            description.startedAt(),
            defaultTime(lastActivityAt),
            description.completedAt(),
            description.failureReason(),
            description.lastEventId());
  }

  public void bindLastEventId(String lastEventId) {
    requireText(lastEventId, "lastEventId");
    description =
        new AcpSessionDescription(
            description.project(),
            description.actor(),
            description.provider(),
            description.mode(),
            description.status(),
            description.startedAt(),
            description.lastActivityAt(),
            description.completedAt(),
            description.failureReason(),
            lastEventId.trim());
  }

  public void markCompleted(Instant completedAt) {
    requireStatus("mark completed", AcpSessionDescription.Status.RUNNING);
    description =
        new AcpSessionDescription(
            description.project(),
            description.actor(),
            description.provider(),
            description.mode(),
            AcpSessionDescription.Status.COMPLETED,
            description.startedAt(),
            description.lastActivityAt(),
            defaultTime(completedAt),
            null,
            description.lastEventId());
  }

  public void markFailed(String reason, Instant completedAt) {
    requireStatus(
        "mark failed", AcpSessionDescription.Status.PENDING, AcpSessionDescription.Status.RUNNING);
    requireText(reason, "reason");
    description =
        new AcpSessionDescription(
            description.project(),
            description.actor(),
            description.provider(),
            description.mode(),
            AcpSessionDescription.Status.FAILED,
            description.startedAt(),
            description.lastActivityAt(),
            defaultTime(completedAt),
            reason.trim(),
            description.lastEventId());
  }

  public void cancel(String reason, Instant completedAt) {
    requireStatus(
        "cancel", AcpSessionDescription.Status.PENDING, AcpSessionDescription.Status.RUNNING);
    requireText(reason, "reason");
    description =
        new AcpSessionDescription(
            description.project(),
            description.actor(),
            description.provider(),
            description.mode(),
            AcpSessionDescription.Status.CANCELLED,
            description.startedAt(),
            description.lastActivityAt(),
            defaultTime(completedAt),
            reason.trim(),
            description.lastEventId());
  }

  private void requireStatus(
      String operation,
      AcpSessionDescription.Status expected,
      AcpSessionDescription.Status... additionallyAllowed) {
    AcpSessionDescription.Status current = description.status();
    if (current == expected) {
      return;
    }
    for (AcpSessionDescription.Status status : additionallyAllowed) {
      if (current == status) {
        return;
      }
    }
    throw new IllegalStateException(
        "Cannot " + operation + " when session is " + current + ". Allowed: " + expected);
  }

  private void requireText(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
  }

  private Instant defaultTime(Instant time) {
    return time == null ? Instant.now() : time;
  }
}
