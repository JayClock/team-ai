package reengineering.ddd.teamai.api.application;

import jakarta.inject.Inject;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.OrchestrationSession;

@Component
public class OrchestrationRuntimeService {
  private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);

  private final AgentRuntime runtime;
  private final Map<String, AgentRuntime.SessionHandle> activeHandles = new ConcurrentHashMap<>();

  @Inject
  public OrchestrationRuntimeService(AgentRuntime runtime) {
    this.runtime = runtime;
  }

  public void onSessionStarted(OrchestrationSession session) {
    if (session == null) {
      throw new IllegalArgumentException("session must not be null");
    }

    var description = session.getDescription();
    String implementerId =
        Optional.ofNullable(description.implementer())
            .map(reengineering.ddd.archtype.Ref::id)
            .filter(id -> !id.isBlank())
            .orElseThrow(() -> new IllegalArgumentException("implementer must not be blank"));

    AgentRuntime.SessionHandle handle =
        runtime.start(
            new AgentRuntime.StartRequest(
                session.getIdentity(), implementerId, description.goal()));
    activeHandles.put(session.getIdentity(), handle);

    runtime.send(handle, new AgentRuntime.SendRequest(description.goal(), DEFAULT_TIMEOUT));
  }

  public void onSessionCancelled(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("sessionId must not be blank");
    }
    AgentRuntime.SessionHandle handle = activeHandles.remove(sessionId);
    if (handle != null) {
      runtime.stop(handle);
    }
  }

  public Optional<AgentRuntime.SessionHandle> findHandle(String sessionId) {
    return Optional.ofNullable(activeHandles.get(sessionId));
  }
}
