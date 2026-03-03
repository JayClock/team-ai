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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.model.AgentProtocolGateway;

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
    AgentProtocolGateway.Health expected =
        new AgentProtocolGateway.Health(AgentProtocolGateway.Status.UP, 1, "local");
    when(localGateway.health()).thenReturn(expected);

    SwitchableAgentProtocolGateway switchable =
        new SwitchableAgentProtocolGateway(localGateway, "local", "http://127.0.0.1:1", 50);

    AgentProtocolGateway.Health actual = switchable.health();

    assertThat(actual).isEqualTo(expected);
    verify(localGateway).health();
  }

  @Test
  void should_use_remote_gateway_when_mode_is_remote() throws IOException {
    AgentRuntimeGateway localGateway = mock(AgentRuntimeGateway.class);
    startServer();

    SwitchableAgentProtocolGateway switchable =
        new SwitchableAgentProtocolGateway(localGateway, "remote", baseUrl(), 20);

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
