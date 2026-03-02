package reengineering.ddd.teamai.description;

import java.time.Instant;
import reengineering.ddd.archtype.Ref;

public record AgentEventDescription(
    Type type, Ref<String> agent, Ref<String> task, String message, Instant occurredAt) {

  public enum Type {
    AGENT_CREATED,
    AGENT_ACTIVATED,
    AGENT_COMPLETED,
    AGENT_ERROR,
    TASK_ASSIGNED,
    TASK_COMPLETED,
    TASK_FAILED,
    TASK_STATUS_CHANGED,
    MESSAGE_SENT,
    REPORT_SUBMITTED
  }
}
