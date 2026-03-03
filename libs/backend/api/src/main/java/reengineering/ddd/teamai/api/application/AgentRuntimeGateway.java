package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.AgentProtocolGateway;
import reengineering.ddd.teamai.model.AgentRuntime;

/** Adapter that bridges {@link AgentRuntime} implementations to the protocol gateway boundary. */
@Component
public class AgentRuntimeGateway implements AgentProtocolGateway {
  private final AgentRuntime runtime;

  @Inject
  public AgentRuntimeGateway(AgentRuntime runtime) {
    this.runtime = runtime;
  }

  @Override
  public SessionHandle start(StartRequest request) {
    AgentRuntime.SessionHandle runtimeHandle =
        runtime.start(
            new AgentRuntime.StartRequest(
                request.orchestrationId(), request.agentId(), request.goal(), request.mcpConfig()));
    return toGatewayHandle(runtimeHandle);
  }

  @Override
  public SendResult send(SessionHandle session, SendRequest request) {
    AgentRuntime.SendResult runtimeResult =
        runtime.send(
            toRuntimeHandle(session),
            new AgentRuntime.SendRequest(request.input(), request.timeout()));
    return new SendResult(runtimeResult.output(), runtimeResult.completedAt());
  }

  @Override
  public void stop(SessionHandle session) {
    runtime.stop(toRuntimeHandle(session));
  }

  @Override
  public Health health() {
    AgentRuntime.Health runtimeHealth = runtime.health();
    return new Health(
        Status.valueOf(runtimeHealth.status().name()),
        runtimeHealth.activeSessions(),
        runtimeHealth.detail());
  }

  private SessionHandle toGatewayHandle(AgentRuntime.SessionHandle runtimeHandle) {
    return new SessionHandle(
        runtimeHandle.sessionId(),
        runtimeHandle.orchestrationId(),
        runtimeHandle.agentId(),
        runtimeHandle.startedAt());
  }

  private AgentRuntime.SessionHandle toRuntimeHandle(SessionHandle gatewayHandle) {
    return new AgentRuntime.SessionHandle(
        gatewayHandle.sessionId(),
        gatewayHandle.orchestrationId(),
        gatewayHandle.agentId(),
        gatewayHandle.startedAt());
  }
}
