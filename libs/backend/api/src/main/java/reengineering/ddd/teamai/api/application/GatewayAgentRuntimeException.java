package reengineering.ddd.teamai.api.application;

import reengineering.ddd.teamai.model.AgentRuntimeException;

/**
 * Runtime exception emitted by the Java HTTP gateway adapter with normalized error semantics from
 * the gateway process.
 */
public class GatewayAgentRuntimeException extends AgentRuntimeException {
  private final String code;
  private final boolean retryable;
  private final long retryAfterMs;
  private final String category;

  public GatewayAgentRuntimeException(
      String code, String message, boolean retryable, long retryAfterMs, String category) {
    super(message);
    this.code = normalize(code, "RUNTIME_FAILURE");
    this.retryable = retryable;
    this.retryAfterMs = Math.max(0L, retryAfterMs);
    this.category = normalize(category, classifyFromCode(this.code));
  }

  public String code() {
    return code;
  }

  public boolean retryable() {
    return retryable;
  }

  public long retryAfterMs() {
    return retryAfterMs;
  }

  public String category() {
    return category;
  }

  private static String normalize(String value, String fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    return value.trim();
  }

  private static String classifyFromCode(String code) {
    String normalized = code.toUpperCase();
    if (normalized.startsWith("PROVIDER_")) {
      return "provider";
    }
    if (normalized.startsWith("PROTOCOL_") || normalized.startsWith("INVALID_")) {
      return "protocol";
    }
    return "runtime";
  }
}
