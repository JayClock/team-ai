package reengineering.ddd.teamai.api.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.model.AgentProtocolGateway;
import reengineering.ddd.teamai.model.AgentRuntimeException;

class SwitchableAgentProtocolGatewayTest {
  private HttpServer server;

  @AfterEach
  void tearDown() {
    if (server != null) {
      server.stop(0);
    }
  }

  @Test
  void should_delegate_to_local_gateway_when_mode_is_local() {
    AgentRuntimeGateway localGateway = mock(AgentRuntimeGateway.class);
    AgentProtocolGateway remoteGateway = mock(AgentProtocolGateway.class);
    AgentProtocolGateway.Health expected =
        new AgentProtocolGateway.Health(AgentProtocolGateway.Status.UP, 1, "local");
    when(localGateway.health()).thenReturn(expected);
    AcpGatewayRoutingController routingController =
        new AcpGatewayRoutingController("local", 3, 60_000, 120_000, System::currentTimeMillis);

    SwitchableAgentProtocolGateway switchable =
        new SwitchableAgentProtocolGateway(localGateway, remoteGateway, routingController);

    AgentProtocolGateway.Health actual = switchable.health();

    assertThat(actual).isEqualTo(expected);
    verify(localGateway).health();
    verify(remoteGateway, never()).health();
  }

  @Test
  void should_use_remote_gateway_when_mode_is_remote() throws IOException {
    AgentRuntimeGateway localGateway = mock(AgentRuntimeGateway.class);
    startServer();
    AcpGatewayRoutingController routingController =
        new AcpGatewayRoutingController("remote", 3, 60_000, 120_000, System::currentTimeMillis);

    SwitchableAgentProtocolGateway switchable =
        new SwitchableAgentProtocolGateway(
            localGateway, new HttpAgentProtocolGateway(baseUrl(), 20), routingController);

    AgentProtocolGateway.Health health = switchable.health();
    AgentProtocolGateway.SessionHandle handle =
        switchable.start(
            new AgentProtocolGateway.StartRequest(
                "orchestration-1", "agent-1", "goal", "{\"provider\":\"codex\"}"));

    assertThat(health.status()).isEqualTo(AgentProtocolGateway.Status.UP);
    assertThat(handle.sessionId()).isEqualTo("remote-s-1");
    verify(localGateway, never()).health();
    verify(localGateway, never()).start(any(AgentProtocolGateway.StartRequest.class));
  }

  @Test
  void should_fallback_to_local_when_remote_errors_hit_threshold() {
    AgentRuntimeGateway localGateway = mock(AgentRuntimeGateway.class);
    AgentProtocolGateway remoteGateway = mock(AgentProtocolGateway.class);
    AgentProtocolGateway.StartRequest request =
        new AgentProtocolGateway.StartRequest("session-1", "agent-1", "goal");
    AgentProtocolGateway.SessionHandle localHandle =
        new AgentProtocolGateway.SessionHandle(
            "local-s-1", "session-1", "agent-1", Instant.parse("2026-03-03T10:00:00Z"));

    AcpGatewayRoutingController routingController =
        new AcpGatewayRoutingController("remote", 1, 60_000, 120_000, System::currentTimeMillis);
    when(remoteGateway.start(any(AgentProtocolGateway.StartRequest.class)))
        .thenThrow(new AgentRuntimeException("remote failed"));
    when(localGateway.start(any(AgentProtocolGateway.StartRequest.class))).thenReturn(localHandle);

    SwitchableAgentProtocolGateway switchable =
        new SwitchableAgentProtocolGateway(localGateway, remoteGateway, routingController);

    AgentProtocolGateway.SessionHandle actual = switchable.start(request);

    assertThat(actual).isEqualTo(localHandle);
    assertThat(routingController.effectiveMode()).isEqualTo("local");
    verify(remoteGateway).start(request);
    verify(localGateway).start(request);
  }

  @Test
  void should_keep_local_route_when_rollout_user_not_allowed() {
    AgentProtocolGateway localGateway = mock(AgentProtocolGateway.class);
    AgentProtocolGateway remoteGateway = mock(AgentProtocolGateway.class);
    AcpGatewayRoutingController routingController =
        new AcpGatewayRoutingController("remote", 3, 60_000, 120_000, System::currentTimeMillis);
    AgentProtocolGateway.StartRequest request =
        new AgentProtocolGateway.StartRequest(
            "session-rollout-1", "user-blocked", "goal", "{\"projectId\":\"project-1\"}");
    AgentProtocolGateway.SessionHandle localHandle =
        new AgentProtocolGateway.SessionHandle(
            "local-rollout-1",
            "session-rollout-1",
            "user-blocked",
            Instant.parse("2026-03-03T10:00:00Z"));
    when(localGateway.start(any(AgentProtocolGateway.StartRequest.class))).thenReturn(localHandle);

    SwitchableAgentProtocolGateway switchable =
        new SwitchableAgentProtocolGateway(
            localGateway,
            remoteGateway,
            routingController,
            java.util.Set.of("project-1"),
            java.util.Set.of("user-allowed"),
            100);

    AgentProtocolGateway.SessionHandle actual = switchable.start(request);

    assertThat(actual).isEqualTo(localHandle);
    verify(localGateway).start(request);
    verify(remoteGateway, never()).start(any(AgentProtocolGateway.StartRequest.class));
  }

  private void startServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/health",
        exchange -> {
          if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"method not allowed\"}");
            return;
          }
          writeJson(exchange, 200, "{\"status\":\"ok\"}");
        });
    server.createContext(
        "/sessions",
        exchange -> {
          if (!"POST".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, "{\"error\":\"method not allowed\"}");
            return;
          }
          writeJson(exchange, 200, "{\"session\":{\"sessionId\":\"remote-s-1\"}}");
        });
    server.start();
  }

  private String baseUrl() {
    return "http://127.0.0.1:" + server.getAddress().getPort();
  }

  private void writeJson(HttpExchange exchange, int status, String body) throws IOException {
    byte[] response = body.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, response.length);
    exchange.getResponseBody().write(response);
    exchange.close();
  }
}
