package reengineering.ddd.teamai.description;

import java.time.Instant;
import reengineering.ddd.archtype.Ref;

public record AcpSessionDescription(
    Ref<String> project,
    Ref<String> actor,
    String provider,
    String mode,
    Status status,
    Instant startedAt,
    Instant lastActivityAt,
    Instant completedAt,
    String failureReason,
    String lastEventId) {

  public enum Status {
    PENDING,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED;

    public boolean isTerminal() {
      return this == COMPLETED || this == FAILED || this == CANCELLED;
    }
  }
}
