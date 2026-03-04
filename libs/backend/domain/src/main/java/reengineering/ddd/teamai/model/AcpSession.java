package reengineering.ddd.teamai.model;

import static reengineering.ddd.teamai.validation.DomainValidation.requireText;

import java.time.Instant;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AcpSessionDescription;

public class AcpSession implements Entity<String, AcpSessionDescription> {
  private String identity;
  private String name;
  private AcpSessionDescription description;

  public AcpSession(String identity, AcpSessionDescription description) {
    this(identity, null, description);
  }

  public AcpSession(String identity, String name, AcpSessionDescription description) {
    this.identity = identity;
    this.name = normalizeName(name);
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

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = normalizeName(name);
  }

  public void rename(String name) {
    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("name must not be blank");
    }
    this.name = normalizeName(name);
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
            description.lastEventId(),
            description.parentSession());
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
            description.lastEventId(),
            description.parentSession());
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
            new Ref<>(lastEventId.trim()),
            description.parentSession());
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
            description.lastEventId(),
            description.parentSession());
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
            description.lastEventId(),
            description.parentSession());
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
            description.lastEventId(),
            description.parentSession());
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

  private Instant defaultTime(Instant time) {
    return time == null ? Instant.now() : time;
  }

  private String normalizeName(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
