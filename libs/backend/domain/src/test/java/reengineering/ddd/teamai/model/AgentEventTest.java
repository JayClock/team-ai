package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.AgentEventDescription.Type;

public class AgentEventTest {

  @Test
  public void should_create_event_with_current_timestamp() {
    Instant occurredAt = Instant.now();
    AgentEventDescription description =
        new AgentEventDescription(
            Type.TASK_ASSIGNED, new Ref<>("agent-1"), new Ref<>("task-1"), "delegated", occurredAt);

    AgentEvent event = new AgentEvent("event-1", description);

    assertEquals("event-1", event.getIdentity());
    assertEquals(description, event.getDescription());
    assertEquals(occurredAt, event.getDescription().occurredAt());
  }

  @Test
  public void should_allow_explicit_timestamp_in_description() {
    Instant occurredAt = Instant.parse("2026-01-01T00:00:00Z");
    AgentEventDescription description =
        new AgentEventDescription(
            Type.REPORT_SUBMITTED,
            new Ref<>("agent-1"),
            new Ref<>("task-1"),
            "report sent",
            occurredAt);

    AgentEvent event = new AgentEvent("event-2", description);

    assertEquals(occurredAt, event.getDescription().occurredAt());
  }
}
