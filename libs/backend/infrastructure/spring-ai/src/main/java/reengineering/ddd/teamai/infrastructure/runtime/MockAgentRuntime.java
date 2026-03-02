package reengineering.ddd.teamai.infrastructure.runtime;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import reengineering.ddd.teamai.model.AgentRuntime;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;

public class MockAgentRuntime implements AgentRuntime {
  public static final String FAILURE_TRIGGER = "[mock:fail]";
  public static final String TIMEOUT_TRIGGER = "[mock:timeout]";
  private static final int DEGRADED_SESSION_THRESHOLD = 32;

  private final Map<String, SessionHandle> activeSessions = new ConcurrentHashMap<>();
  private final AtomicBoolean available = new AtomicBoolean(true);

  @Override
  public SessionHandle start(StartRequest request) {
    requireAvailable();
    if (request == null) {
      throw new IllegalArgumentException("request must not be null");
    }
    SessionHandle session =
        new SessionHandle(
            "runtime-" + UUID.randomUUID(),
            request.orchestrationId(),
            request.agentId(),
            Instant.now());
    activeSessions.put(session.sessionId(), session);
    return session;
  }

  @Override
  public SendResult send(SessionHandle session, SendRequest request) {
    requireAvailable();
    requireActiveSession(session);
    if (request == null) {
      throw new IllegalArgumentException("request must not be null");
    }

    if (request.input().contains(TIMEOUT_TRIGGER)) {
      throw new AgentRuntimeTimeoutException("Mock runtime timed out after " + request.timeout());
    }
    if (request.input().contains(FAILURE_TRIGGER)) {
      throw new AgentRuntimeException(
          "Mock runtime simulated failure for input: " + request.input());
    }
    return new SendResult(
        "mock-response[" + session.agentId() + "]: " + request.input().trim(), Instant.now());
  }

  @Override
  public void stop(SessionHandle session) {
    if (session == null) {
      throw new IllegalArgumentException("session must not be null");
    }
    activeSessions.remove(session.sessionId());
  }

  @Override
  public Health health() {
    int sessionCount = activeSessions.size();
    if (!available.get()) {
      return new Health(Status.DOWN, sessionCount, "Mock runtime is unavailable");
    }
    if (sessionCount > DEGRADED_SESSION_THRESHOLD) {
      return new Health(Status.DEGRADED, sessionCount, "High active session count");
    }
    return new Health(Status.UP, sessionCount, "Mock runtime is healthy");
  }

  public void setAvailable(boolean available) {
    this.available.set(available);
  }

  private void requireAvailable() {
    if (!available.get()) {
      throw new AgentRuntimeException("Agent runtime is unavailable");
    }
  }

  private void requireActiveSession(SessionHandle session) {
    if (session == null) {
      throw new IllegalArgumentException("session must not be null");
    }
    if (!activeSessions.containsKey(session.sessionId())) {
      throw new AgentRuntimeException("Runtime session is not active: " + session.sessionId());
    }
  }
}
