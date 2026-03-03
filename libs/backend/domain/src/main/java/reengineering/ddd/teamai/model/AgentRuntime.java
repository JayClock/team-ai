package reengineering.ddd.teamai.model;

import java.time.Duration;
import java.time.Instant;

public interface AgentRuntime {
  SessionHandle start(StartRequest request);

  SendResult send(SessionHandle session, SendRequest request);

  void stop(SessionHandle session);

  Health health();

  record StartRequest(String orchestrationId, String agentId, String goal, String mcpConfig) {
    public StartRequest(String orchestrationId, String agentId, String goal) {
      this(orchestrationId, agentId, goal, null);
    }

    public StartRequest {
      requireText(orchestrationId, "orchestrationId");
      requireText(agentId, "agentId");
      requireText(goal, "goal");
    }
  }

  record SessionHandle(
      String sessionId, String orchestrationId, String agentId, Instant startedAt) {
    public SessionHandle {
      requireText(sessionId, "sessionId");
      requireText(orchestrationId, "orchestrationId");
      requireText(agentId, "agentId");
      if (startedAt == null) {
        throw new IllegalArgumentException("startedAt must not be null");
      }
    }
  }

  record SendRequest(String input, Duration timeout) {
    public SendRequest {
      requireText(input, "input");
      if (timeout == null || timeout.isZero() || timeout.isNegative()) {
        throw new IllegalArgumentException("timeout must be a positive duration");
      }
    }
  }

  record SendResult(String output, Instant completedAt) {
    public SendResult {
      requireText(output, "output");
      if (completedAt == null) {
        throw new IllegalArgumentException("completedAt must not be null");
      }
    }
  }

  record Health(Status status, int activeSessions, String detail) {
    public Health {
      if (status == null) {
        throw new IllegalArgumentException("status must not be null");
      }
      if (activeSessions < 0) {
        throw new IllegalArgumentException("activeSessions must not be negative");
      }
      if (detail == null) {
        detail = "";
      }
    }
  }

  enum Status {
    UP,
    DOWN,
    DEGRADED
  }

  private static void requireText(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " must not be blank");
    }
  }
}
