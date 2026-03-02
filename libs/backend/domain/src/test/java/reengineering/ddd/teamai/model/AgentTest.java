package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentDescription.Role;
import reengineering.ddd.teamai.description.AgentDescription.Status;

public class AgentTest {
  private Agent agent;
  private AgentDescription description;

  @BeforeEach
  public void setUp() {
    description =
        new AgentDescription(
            "Coordinator", Role.ROUTA, "SMART", Status.PENDING, new Ref<>("agent-parent"));
    agent = new Agent("agent-1", description);
  }

  @Test
  public void should_return_identity() {
    assertEquals("agent-1", agent.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(description, agent.getDescription());
  }

  @Test
  public void should_return_status() {
    assertEquals(Status.PENDING, agent.getDescription().status());
  }

  @Test
  public void should_return_parent_ref() {
    assertEquals(new Ref<>("agent-parent"), agent.getDescription().parent());
  }
}
