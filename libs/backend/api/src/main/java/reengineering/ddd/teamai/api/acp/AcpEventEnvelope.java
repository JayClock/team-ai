package reengineering.ddd.teamai.api.acp;

import java.time.Instant;
import java.util.Map;

public record AcpEventEnvelope(
    String eventId,
    String sessionId,
    String type,
    Instant emittedAt,
    Map<String, Object> data,
    EventError error) {
  public static final String TYPE_DELTA = "delta";
  public static final String TYPE_STATUS = "status";
  public static final String TYPE_ERROR = "error";
  public static final String TYPE_COMPLETE = "complete";

  public record EventError(String code, String message, boolean retryable, long retryAfterMs) {}
}
