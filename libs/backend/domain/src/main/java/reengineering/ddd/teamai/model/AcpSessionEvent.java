package reengineering.ddd.teamai.model;

import java.time.Instant;
import java.util.Map;

public record AcpSessionEvent(
    String eventId,
    String sessionId,
    String type,
    Instant emittedAt,
    Map<String, Object> data,
    Error error) {
  public AcpSessionEvent {
    if (eventId == null || eventId.isBlank()) {
      throw new IllegalArgumentException("eventId must not be blank");
    }
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("sessionId must not be blank");
    }
    if (type == null || type.isBlank()) {
      throw new IllegalArgumentException("type must not be blank");
    }
    if (emittedAt == null) {
      throw new IllegalArgumentException("emittedAt must not be null");
    }
    data = data == null ? Map.of() : Map.copyOf(data);
  }

  public record Error(String code, String message, boolean retryable, long retryAfterMs) {
    public Error {
      if (code == null || code.isBlank()) {
        throw new IllegalArgumentException("code must not be blank");
      }
      if (message == null) {
        message = "";
      }
      if (retryAfterMs < 0) {
        throw new IllegalArgumentException("retryAfterMs must not be negative");
      }
    }
  }
}
