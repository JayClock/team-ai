package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.inject.Inject;
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
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.mybatis.mappers.ProjectAgentsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class ProjectAgentsMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectAgentsMapper agentsMapper;

  private final int userId = id();
  private final int projectId = id();
  private final int parentAgentId = id();
  private final int agentId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Test Project" + projectId);
    testData.insertProjectAgent(
        parentAgentId, projectId, "Routa", "ROUTA", "SMART", "ACTIVE", null);
    testData.insertProjectAgent(
        agentId, projectId, "Crafter", "CRAFTER", "BALANCED", "PENDING", parentAgentId);
  }

  @Test
  void should_find_agent_by_project_and_id() {
    Agent agent = agentsMapper.findAgentByProjectAndId(projectId, agentId);

    assertEquals(String.valueOf(agentId), agent.getIdentity());
    assertEquals("Crafter", agent.getDescription().name());
    assertEquals(AgentDescription.Role.CRAFTER, agent.getDescription().role());
    assertEquals("BALANCED", agent.getDescription().modelTier());
    assertEquals(AgentDescription.Status.PENDING, agent.getDescription().status());
    assertNotNull(agent.getDescription().parent());
    assertEquals(String.valueOf(parentAgentId), agent.getDescription().parent().id());
  }

  @Test
  void should_insert_agent_to_database() {
    IdHolder holder = new IdHolder();
    AgentDescription description =
        new AgentDescription(
            "Gate", AgentDescription.Role.GATE, "FAST", AgentDescription.Status.PENDING, null);

    agentsMapper.insertAgent(holder, projectId, description);

    Agent saved = agentsMapper.findAgentByProjectAndId(projectId, holder.id());
    assertEquals("Gate", saved.getDescription().name());
    assertEquals(AgentDescription.Role.GATE, saved.getDescription().role());
    assertEquals("FAST", saved.getDescription().modelTier());
  }

  @Test
  void should_update_agent_status() {
    agentsMapper.updateAgentStatus(
        projectId, new Ref<>(String.valueOf(agentId)), AgentDescription.Status.COMPLETED);

    Agent updated = agentsMapper.findAgentByProjectAndId(projectId, agentId);
    assertEquals(AgentDescription.Status.COMPLETED, updated.getDescription().status());
  }

  @Test
  void should_count_and_list_agents_by_project() {
    int count = agentsMapper.countAgentsByProject(projectId);
    assertEquals(2, count);

    List<Agent> list = agentsMapper.findAgentsByProjectId(projectId, 0, 10);
    assertEquals(2, list.size());
  }
}
