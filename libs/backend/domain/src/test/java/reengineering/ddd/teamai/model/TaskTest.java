package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.description.TaskDescription.Status;
import reengineering.ddd.teamai.description.TaskDescription.VerificationVerdict;

public class TaskTest {
  private Task task;
  private TaskDescription description;

  @BeforeEach
  public void setUp() {
    description =
        new TaskDescription(
            "Implement orchestration",
            "Add task and agent domain models",
            "domain layer",
            List.of("Domain models compile"),
            List.of("./gradlew :backend:domain:test"),
            Status.PENDING,
            null,
            null,
            null,
            null,
            null);
    task = new Task("task-1", description);
  }

  @Test
  public void should_return_identity() {
    assertEquals("task-1", task.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(description, task.getDescription());
  }

  @Test
  public void should_store_status_in_description() {
    assertEquals(Status.PENDING, task.getDescription().status());
  }

  @Test
  public void should_hold_extended_status_fields_in_description() {
    TaskDescription detailed =
        new TaskDescription(
            "Implement orchestration",
            "Add task and agent domain models",
            "domain layer",
            List.of("Domain models compile"),
            List.of("./gradlew :backend:domain:test"),
            Status.REVIEW_REQUIRED,
            new Ref<>("agent-1"),
            new Ref<>("agent-parent"),
            "Ready for verification",
            VerificationVerdict.APPROVED,
            "Verified by GATE");
    Task detailedTask = new Task("task-2", detailed);

    assertEquals(Status.REVIEW_REQUIRED, detailedTask.getDescription().status());
    assertEquals(new Ref<>("agent-1"), detailedTask.getDescription().assignedTo());
    assertEquals(new Ref<>("agent-parent"), detailedTask.getDescription().delegatedBy());
    assertEquals("Ready for verification", detailedTask.getDescription().completionSummary());
    assertEquals(VerificationVerdict.APPROVED, detailedTask.getDescription().verificationVerdict());
    assertEquals("Verified by GATE", detailedTask.getDescription().verificationReport());
  }
}
