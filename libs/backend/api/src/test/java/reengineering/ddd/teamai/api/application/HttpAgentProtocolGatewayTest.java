package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import reengineering.ddd.teamai.model.AgentProtocolGateway;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

class HttpAgentProtocolGatewayTest {
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  private HttpServer server;

  @AfterEach
  void tearDown() {
    MDC.clear();
    if (server != null) {
      server.stop(0);
    }
  }

  @Test
  void should_start_session_with_provider_and_trace_id() throws IOException {
    AtomicReference<JsonNode> payload = new AtomicReference<>();
    AtomicReference<String> traceHeader = new AtomicReference<>();
    startServer(
        exchange -> {
          if ("POST".equals(exchange.getRequestMethod())
              && "/sessions".equals(exchange.getRequestURI().getPath())) {
            payload.set(readJsonBody(exchange));
            traceHeader.set(exchange.getRequestHeaders().getFirst("X-Trace-Id"));
            writeJson(exchange, 200, "{\"session\":{\"sessionId\":\"remote-s-1\"}}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });

    MDC.put("traceId", "trace-remote-1");
    HttpAgentProtocolGateway gateway = new HttpAgentProtocolGateway(baseUrl(), 50);
    AgentProtocolGateway.SessionHandle handle =
        gateway.start(
            new AgentProtocolGateway.StartRequest(
                "orchestration-1", "agent-1", "goal", "{\"provider\":\"a2a\"}"));

    assertThat(handle.sessionId()).isEqualTo("remote-s-1");
    assertThat(handle.orchestrationId()).isEqualTo("orchestration-1");
    assertThat(payload.get().path("provider").asText()).isEqualTo("a2a");
    assertThat(payload.get().path("traceId").asText()).isEqualTo("trace-remote-1");
    assertThat(traceHeader.get()).isEqualTo("trace-remote-1");
  }

  @Test
  void should_send_prompt_by_polling_events_until_complete() throws IOException {
    AtomicReference<JsonNode> promptPayload = new AtomicReference<>();
    AtomicInteger eventPollCount = new AtomicInteger();
    AtomicReference<String> secondPollCursor = new AtomicReference<>();

    startServer(
        exchange -> {
          String path = exchange.getRequestURI().getPath();
          if ("POST".equals(exchange.getRequestMethod())
              && "/sessions/remote-s-2/prompt".equals(path)) {
            promptPayload.set(readJsonBody(exchange));
            writeJson(exchange, 200, "{\"accepted\":true}");
            return;
          }
          if ("GET".equals(exchange.getRequestMethod())
              && "/sessions/remote-s-2/events".equals(path)) {
            int current = eventPollCount.incrementAndGet();
            if (current == 1) {
              writeJson(
                  exchange,
                  200,
                  "{\"events\":[{\"cursor\":\"c-1\",\"type\":\"delta\",\"data\":{\"text\":\"chunk-1\"}}]}");
              return;
            }
            secondPollCursor.set(exchange.getRequestURI().getQuery());
            writeJson(
                exchange,
                200,
                "{\"events\":[{\"cursor\":\"c-2\",\"type\":\"complete\",\"data\":{\"reason\":\"done\"}}]}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });

    HttpAgentProtocolGateway gateway = new HttpAgentProtocolGateway(baseUrl(), 20);
    AgentProtocolGateway.SendResult result =
        gateway.send(
            session("remote-s-2"),
            new AgentProtocolGateway.SendRequest("hello world", Duration.ofSeconds(2)));

    assertThat(result.output()).isEqualTo("chunk-1");
    assertThat(result.completedAt()).isNotNull();
    assertThat(promptPayload.get().path("input").asText()).isEqualTo("hello world");
    assertThat(promptPayload.get().path("timeoutMs").asLong()).isEqualTo(2000L);
    assertThat(secondPollCursor.get()).isEqualTo("cursor=c-1");
  }

  @Test
  void should_throw_runtime_exception_when_gateway_returns_error_event() throws IOException {
    startServer(
        exchange -> {
          String path = exchange.getRequestURI().getPath();
          if ("POST".equals(exchange.getRequestMethod())
              && "/sessions/remote-s-3/prompt".equals(path)) {
            writeJson(exchange, 200, "{\"accepted\":true}");
            return;
          }
          if ("GET".equals(exchange.getRequestMethod())
              && "/sessions/remote-s-3/events".equals(path)) {
            writeJson(
                exchange,
                200,
                "{\"events\":[{\"cursor\":\"c-1\",\"type\":\"error\",\"error\":{\"message\":\"provider failed\"}}]}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });

    HttpAgentProtocolGateway gateway = new HttpAgentProtocolGateway(baseUrl(), 20);

    AgentRuntimeException error =
        assertThrows(
            AgentRuntimeException.class,
            () ->
                gateway.send(
                    session("remote-s-3"),
                    new AgentProtocolGateway.SendRequest("prompt", Duration.ofSeconds(2))));
    assertThat(error.getMessage()).contains("provider failed");
    assertThat(error).isInstanceOf(GatewayAgentRuntimeException.class);
    GatewayAgentRuntimeException gatewayError = (GatewayAgentRuntimeException) error;
    assertThat(gatewayError.code()).isEqualTo("RUNTIME_FAILURE");
    assertThat(gatewayError.category()).isEqualTo("runtime");
  }

  @Test
  void should_map_gateway_error_from_http_response_body() throws IOException {
    startServer(
        exchange -> {
          if ("POST".equals(exchange.getRequestMethod())
              && "/sessions".equals(exchange.getRequestURI().getPath())) {
            writeJson(
                exchange,
                400,
                "{\"error\":{\"code\":\"PROTOCOL_INVALID_PAYLOAD\",\"message\":\"bad payload\",\"retryable\":false,\"retryAfterMs\":0,\"category\":\"protocol\"}}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });

    HttpAgentProtocolGateway gateway = new HttpAgentProtocolGateway(baseUrl(), 20);

    AgentRuntimeException error =
        assertThrows(
            AgentRuntimeException.class,
            () ->
                gateway.start(
                    new AgentProtocolGateway.StartRequest(
                        "orchestration-http-1", "agent-http-1", "goal", "{\"provider\":\"acp\"}")));
    assertThat(error).isInstanceOf(GatewayAgentRuntimeException.class);
    GatewayAgentRuntimeException gatewayError = (GatewayAgentRuntimeException) error;
    assertThat(gatewayError.code()).isEqualTo("PROTOCOL_INVALID_PAYLOAD");
    assertThat(gatewayError.category()).isEqualTo("protocol");
    assertThat(gatewayError.retryable()).isFalse();
    assertThat(gatewayError.retryAfterMs()).isEqualTo(0L);
  }

  @Test
  void should_throw_timeout_when_no_complete_event_received() throws IOException {
    startServer(
        exchange -> {
          String path = exchange.getRequestURI().getPath();
          if ("POST".equals(exchange.getRequestMethod())
              && "/sessions/remote-s-4/prompt".equals(path)) {
            writeJson(exchange, 200, "{\"accepted\":true}");
            return;
          }
          if ("GET".equals(exchange.getRequestMethod())
              && "/sessions/remote-s-4/events".equals(path)) {
            writeJson(exchange, 200, "{\"events\":[]}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });

    HttpAgentProtocolGateway gateway = new HttpAgentProtocolGateway(baseUrl(), 20);

    AgentRuntimeTimeoutException error =
        assertThrows(
            AgentRuntimeTimeoutException.class,
            () ->
                gateway.send(
                    session("remote-s-4"),
                    new AgentProtocolGateway.SendRequest("prompt", Duration.ofMillis(120))));
    assertThat(error.getMessage()).contains("timed out");
  }

  @Test
  void should_cancel_remote_session() throws IOException {
    AtomicInteger cancelCount = new AtomicInteger();
    AtomicReference<JsonNode> cancelPayload = new AtomicReference<>();
    startServer(
        exchange -> {
          if ("POST".equals(exchange.getRequestMethod())
              && "/sessions/remote-s-5/cancel".equals(exchange.getRequestURI().getPath())) {
            cancelCount.incrementAndGet();
            cancelPayload.set(readJsonBody(exchange));
            writeJson(exchange, 200, "{\"cancelled\":true}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });

    HttpAgentProtocolGateway gateway = new HttpAgentProtocolGateway(baseUrl(), 50);
    gateway.stop(session("remote-s-5"));

    assertThat(cancelCount.get()).isEqualTo(1);
    assertThat(cancelPayload.get().path("reason").asText()).contains("cancelled by java runtime");
  }

  @Test
  void should_map_health_status() throws IOException {
    startServer(
        exchange -> {
          if ("GET".equals(exchange.getRequestMethod())
              && "/health".equals(exchange.getRequestURI().getPath())) {
            writeJson(exchange, 200, "{\"status\":\"ok\"}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });
    HttpAgentProtocolGateway healthyGateway = new HttpAgentProtocolGateway(baseUrl(), 50);
    AgentProtocolGateway.Health up = healthyGateway.health();
    assertThat(up.status()).isEqualTo(AgentProtocolGateway.Status.UP);

    server.stop(0);
    server = null;

    startServer(
        exchange -> {
          if ("GET".equals(exchange.getRequestMethod())
              && "/health".equals(exchange.getRequestURI().getPath())) {
            writeJson(exchange, 200, "{\"status\":\"degraded\"}");
            return;
          }
          writeJson(exchange, 404, "{\"error\":\"not found\"}");
        });
    HttpAgentProtocolGateway degradedGateway = new HttpAgentProtocolGateway(baseUrl(), 50);
    AgentProtocolGateway.Health degraded = degradedGateway.health();
    assertThat(degraded.status()).isEqualTo(AgentProtocolGateway.Status.DEGRADED);
  }

  private AgentProtocolGateway.SessionHandle session(String sessionId) {
    return new AgentProtocolGateway.SessionHandle(
        sessionId, "orchestration-" + sessionId, "agent-1", Instant.parse("2026-03-03T10:00:00Z"));
  }

  private void startServer(HttpHandler handler) throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/", handler);
    server.start();
  }

  private String baseUrl() {
    return "http://127.0.0.1:" + server.getAddress().getPort();
  }

  private JsonNode readJsonBody(HttpExchange exchange) throws IOException {
    byte[] bytes = exchange.getRequestBody().readAllBytes();
    if (bytes.length == 0) {
      return OBJECT_MAPPER.createObjectNode();
    }
    return OBJECT_MAPPER.readTree(new String(bytes, StandardCharsets.UTF_8));
  }

  private void writeJson(HttpExchange exchange, int status, String body) throws IOException {
    byte[] response = body.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, response.length);
    exchange.getResponseBody().write(response);
    exchange.close();
  }
}
