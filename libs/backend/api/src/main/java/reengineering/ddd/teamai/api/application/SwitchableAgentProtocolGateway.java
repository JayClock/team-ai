package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.AgentProtocolGateway;

/**
 * Delegates to either local runtime-backed gateway or remote HTTP gateway based on configuration.
 */
@Component
@Primary
public class SwitchableAgentProtocolGateway implements AgentProtocolGateway {
  private final AgentProtocolGateway delegate;

  @Inject
  public SwitchableAgentProtocolGateway(
      AgentRuntimeGateway localGateway,
      @Value("${team-ai.acp.gateway.mode:local}") String mode,
      @Value("${team-ai.acp.gateway.base-url:http://127.0.0.1:3321}") String baseUrl,
      @Value("${team-ai.acp.gateway.poll-interval-ms:200}") long pollIntervalMillis) {
    if ("remote".equalsIgnoreCase(mode)) {
      this.delegate = new HttpAgentProtocolGateway(baseUrl, pollIntervalMillis);
      return;
    }
    this.delegate = localGateway;
  }

  @Override
  public SessionHandle start(StartRequest request) {
    return delegate.start(request);
  }

  @Override
  public SendResult send(SessionHandle session, SendRequest request) {
    return delegate.send(session, request);
  }

  @Override
  public void stop(SessionHandle session) {
    delegate.stop(session);
  }

  @Override
  public Health health() {
    return delegate.health();
  }
}
