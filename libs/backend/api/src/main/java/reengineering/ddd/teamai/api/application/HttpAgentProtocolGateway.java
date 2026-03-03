package reengineering.ddd.teamai.api.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.MDC;
import reengineering.ddd.teamai.model.AgentProtocolGateway;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

/**
 * Remote {@link AgentProtocolGateway} implementation backed by the agent-gateway HTTP service.
 *
 * <p>This adapter keeps Java-side orchestration logic stable while delegating provider protocol
 * handling to the TypeScript gateway.
 */
public class HttpAgentProtocolGateway implements AgentProtocolGateway {
  private static final String TRACE_ID_HEADER = "X-Trace-Id";
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
  private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE =
      new TypeReference<>() {};

  private final HttpClient client;
  private final String baseUrl;
  private final long pollIntervalMillis;
  private final Map<String, String> sessionCursors = new ConcurrentHashMap<>();

  public HttpAgentProtocolGateway(String baseUrl, long pollIntervalMillis) {
    this(HttpClient.newHttpClient(), baseUrl, pollIntervalMillis);
  }

  HttpAgentProtocolGateway(HttpClient client, String baseUrl, long pollIntervalMillis) {
    this.client = client;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.pollIntervalMillis = Math.max(50L, pollIntervalMillis);
  }

  @Override
  public SessionHandle start(StartRequest request) {
    JsonNode response =
        postJson(
            "/sessions", Map.of("traceId", traceId(), "provider", providerFromRequest(request)));
    String remoteSessionId = text(response.path("session"), "sessionId");
    if (remoteSessionId == null || remoteSessionId.isBlank()) {
      throw new AgentRuntimeException("Agent gateway returned empty sessionId");
    }
    return new SessionHandle(
        remoteSessionId, request.orchestrationId(), request.agentId(), Instant.now());
  }

  @Override
  public SendResult send(SessionHandle session, SendRequest request) {
    String sessionId = session.sessionId();
    postJson(
        "/sessions/" + encode(sessionId) + "/prompt",
        Map.of(
            "input", request.input(),
            "timeoutMs", request.timeout().toMillis(),
            "traceId", traceId()));

    Instant deadline = Instant.now().plus(request.timeout());
    StringBuilder output = new StringBuilder();
    String cursor = sessionCursors.get(sessionId);
    while (Instant.now().isBefore(deadline)) {
      JsonNode page = getEvents(sessionId, cursor);
      JsonNode events = page.path("events");
      if (events.isArray()) {
        for (JsonNode event : events) {
          String eventCursor = text(event, "cursor");
          if (eventCursor != null && !eventCursor.isBlank()) {
            cursor = eventCursor;
            sessionCursors.put(sessionId, cursor);
          }

          String type = text(event, "type");
          if ("delta".equals(type)) {
            appendDelta(output, event.path("data"));
          } else if ("error".equals(type)) {
            JsonNode error = event.path("error");
            throw gatewayException(
                error,
                "RUNTIME_FAILURE",
                text(error, "message") == null ? "gateway error" : text(error, "message"));
          } else if ("complete".equals(type)) {
            String mergedOutput = normalizeOutput(output.toString(), event.path("data"));
            return new SendResult(mergedOutput, Instant.now());
          }
        }
      }

      sleepPolling();
    }

    throw new AgentRuntimeTimeoutException(
        "Gateway prompt timed out after " + request.timeout().toMillis() + "ms");
  }

  @Override
  public void stop(SessionHandle session) {
    postJson(
        "/sessions/" + encode(session.sessionId()) + "/cancel",
        Map.of("reason", "cancelled by java runtime bridge", "traceId", traceId()));
  }

  @Override
  public Health health() {
    JsonNode response = getJson("/health");
    String status = text(response, "status");
    if ("ok".equalsIgnoreCase(status)) {
      return new Health(Status.UP, 0, "agent-gateway reachable");
    }
    return new Health(Status.DEGRADED, 0, "agent-gateway status: " + status);
  }

  private JsonNode getEvents(String sessionId, String cursor) {
    String path = "/sessions/" + encode(sessionId) + "/events";
    if (cursor != null && !cursor.isBlank()) {
      path = path + "?cursor=" + encode(cursor);
    }
    return getJson(path);
  }

  private JsonNode getJson(String path) {
    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + path))
            .timeout(REQUEST_TIMEOUT)
            .GET()
            .header("Accept", "application/json")
            .header(TRACE_ID_HEADER, traceId())
            .build();
    return send(request);
  }

  private JsonNode postJson(String path, Map<String, Object> body) {
    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + path))
            .timeout(REQUEST_TIMEOUT)
            .POST(HttpRequest.BodyPublishers.ofString(toJson(body)))
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header(TRACE_ID_HEADER, traceId())
            .build();
    return send(request);
  }

  private JsonNode send(HttpRequest request) {
    try {
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() >= 400) {
        JsonNode payload = parseJson(response.body());
        JsonNode error = payload.path("error");
        throw gatewayException(
            error,
            "RUNTIME_HTTP_" + response.statusCode(),
            "Gateway request failed: " + response.statusCode());
      }
      return parseJson(response.body());
    } catch (IOException error) {
      throw new AgentRuntimeException("Gateway IO error: " + error.getMessage());
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new AgentRuntimeException("Gateway request interrupted");
    }
  }

  private JsonNode parseJson(String body) throws IOException {
    if (body == null || body.isBlank()) {
      return OBJECT_MAPPER.createObjectNode();
    }
    return OBJECT_MAPPER.readTree(body);
  }

  private String toJson(Map<String, Object> value) {
    try {
      return OBJECT_MAPPER.writeValueAsString(value);
    } catch (IOException error) {
      throw new AgentRuntimeException("Failed to serialize gateway request body");
    }
  }

  private String normalizeOutput(String output, JsonNode completeData) {
    String trimmed = output == null ? "" : output.trim();
    if (!trimmed.isBlank()) {
      return trimmed;
    }
    String reason = text(completeData, "reason");
    return reason == null || reason.isBlank() ? "completed" : reason;
  }

  private void appendDelta(StringBuilder output, JsonNode data) {
    String text = text(data, "text");
    if (text == null || text.isBlank()) {
      text = text(data, "content");
    }
    if (text != null && !text.isBlank()) {
      if (!output.isEmpty()) {
        output.append('\n');
      }
      output.append(text);
    }
  }

  private void sleepPolling() {
    try {
      Thread.sleep(pollIntervalMillis);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new AgentRuntimeException("Gateway polling interrupted");
    }
  }

  private String providerFromRequest(StartRequest request) {
    Map<String, Object> mcpConfig = parseMcpConfig(request.mcpConfig());
    Object provider = mcpConfig.get("provider");
    if (provider instanceof String providerText && !providerText.isBlank()) {
      return providerText;
    }
    return "codex";
  }

  private AgentRuntimeException gatewayException(
      JsonNode errorNode, String fallbackCode, String fallbackMessage) {
    String code = text(errorNode, "code");
    String message = text(errorNode, "message");
    boolean retryable = bool(errorNode, "retryable", true);
    long retryAfterMs = number(errorNode, "retryAfterMs", 1000L);
    String category = text(errorNode, "category");
    String resolvedCode = code == null || code.isBlank() ? fallbackCode : code;
    String resolvedMessage = message == null || message.isBlank() ? fallbackMessage : message;
    String resolvedCategory =
        category == null || category.isBlank() ? classifyCategory(resolvedCode) : category;
    if (isTimeoutCode(resolvedCode)) {
      return new AgentRuntimeTimeoutException(resolvedMessage);
    }
    return new GatewayAgentRuntimeException(
        resolvedCode, resolvedMessage, retryable, retryAfterMs, resolvedCategory);
  }

  private boolean isTimeoutCode(String code) {
    return code != null && code.toUpperCase().contains("TIMEOUT");
  }

  private String classifyCategory(String code) {
    if (code == null || code.isBlank()) {
      return "runtime";
    }
    String normalized = code.toUpperCase();
    if (normalized.startsWith("PROVIDER_")) {
      return "provider";
    }
    if (normalized.startsWith("PROTOCOL_")
        || normalized.startsWith("INVALID_")
        || normalized.equals("NOT_FOUND")
        || normalized.equals("SESSION_NOT_FOUND")) {
      return "protocol";
    }
    return "runtime";
  }

  private Map<String, Object> parseMcpConfig(String mcpConfig) {
    if (mcpConfig == null || mcpConfig.isBlank()) {
      return Map.of();
    }
    try {
      JsonNode root = OBJECT_MAPPER.readTree(mcpConfig);
      if (root.isObject()) {
        return OBJECT_MAPPER.convertValue(root, MAP_TYPE);
      }
    } catch (IOException ignored) {
      // Best effort parsing only; fallback to default provider.
    }
    return Map.of();
  }

  private String traceId() {
    String traceId = MDC.get("traceId");
    return traceId == null || traceId.isBlank() ? "java-bridge" : traceId;
  }

  private String normalizeBaseUrl(String value) {
    String normalized = value == null || value.isBlank() ? "http://127.0.0.1:3321" : value.trim();
    return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
  }

  private String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  private boolean bool(JsonNode node, String field, boolean fallback) {
    JsonNode value = node.path(field);
    if (value.isMissingNode() || value.isNull()) {
      return fallback;
    }
    return value.asBoolean(fallback);
  }

  private long number(JsonNode node, String field, long fallback) {
    JsonNode value = node.path(field);
    if (value.isMissingNode() || value.isNull()) {
      return fallback;
    }
    long candidate = value.asLong(fallback);
    return Math.max(0L, candidate);
  }

  private String text(JsonNode node, String field) {
    JsonNode value = node.path(field);
    if (value.isMissingNode() || value.isNull()) {
      return null;
    }
    return value.asText();
  }
}
