package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAgentEventsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectAgentEventsMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectAgentEventsMapper eventsMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int agentId = id();
  private final int taskId = id();
  private final int eventId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertProjectAgent(agentId, projectId, "Crafter", "CRAFTER", "SMART", "ACTIVE", null);
    testData.insertProjectTask(
        taskId,
        projectId,
        "Implement events",
        "Persist agent events",
        "event stream",
        "[\"persist event\"]",
        "[\"verify event\"]",
        "PENDING",
        agentId,
        null,
        null,
        null,
        null);
    testData.insertProjectAgentEvent(
        eventId,
        projectId,
        "TASK_ASSIGNED",
        agentId,
        taskId,
        "Task assigned to crafter",
        Instant.parse("2026-01-01T00:00:00Z"));
  }

  @Test
  void should_find_event_by_project_and_id() {
    AgentEvent event = eventsMapper.findEventByProjectAndId(projectId, eventId);

    assertEquals(String.valueOf(eventId), event.getIdentity());
    assertEquals(AgentEventDescription.Type.TASK_ASSIGNED, event.getDescription().type());
    assertNotNull(event.getDescription().agent());
    assertEquals(String.valueOf(agentId), event.getDescription().agent().id());
    assertNotNull(event.getDescription().task());
    assertEquals(String.valueOf(taskId), event.getDescription().task().id());
    assertEquals("Task assigned to crafter", event.getDescription().message());
    assertEquals(Instant.parse("2026-01-01T00:00:00Z"), event.getDescription().occurredAt());
  }

  @Test
  void should_insert_event_to_database() {
    IdHolder holder = new IdHolder();
    AgentEventDescription description =
        new AgentEventDescription(
            AgentEventDescription.Type.REPORT_SUBMITTED,
            new Ref<>(String.valueOf(agentId)),
            new Ref<>(String.valueOf(taskId)),
            "report submitted",
            Instant.parse("2026-01-02T00:00:00Z"));

    eventsMapper.insertEvent(holder, projectId, description);

    AgentEvent saved = eventsMapper.findEventByProjectAndId(projectId, holder.id());
    assertEquals(AgentEventDescription.Type.REPORT_SUBMITTED, saved.getDescription().type());
    assertEquals("report submitted", saved.getDescription().message());
  }

  @Test
  void should_count_and_list_events_by_project() {
    int count = eventsMapper.countEventsByProject(projectId);
    assertEquals(1, count);

    List<AgentEvent> list = eventsMapper.findEventsByProjectId(projectId, 0, 10);
    assertEquals(1, list.size());
  }
}
