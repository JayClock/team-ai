package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import reengineering.ddd.FlywayConfig;
import reengineering.ddd.TestCacheConfig;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataSetup;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
public class ProjectAgentsTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private Project project;

  @BeforeEach
  public void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    User user = users.findByIdentity("1").get();
    project = user.projects().findAll().stream().findFirst().get();
  }

  @Test
  void should_create_and_find_agent() {
    Agent created =
        project.createAgent(
            new AgentDescription(
                "Coordinator",
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.PENDING,
                null));

    assertEquals("Coordinator", created.getDescription().name());

    Agent loaded = project.agents().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals(AgentDescription.Role.ROUTA, loaded.getDescription().role());
    assertEquals(AgentDescription.Status.PENDING, loaded.getDescription().status());
  }

  @Test
  void should_update_agent_status() {
    Agent created =
        project.createAgent(
            new AgentDescription(
                "Crafter",
                AgentDescription.Role.CRAFTER,
                "BALANCED",
                AgentDescription.Status.PENDING,
                null));

    project.updateAgentStatus(
        new reengineering.ddd.archtype.Ref<>(created.getIdentity()),
        AgentDescription.Status.ACTIVE);

    Agent loaded = project.agents().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals(AgentDescription.Status.ACTIVE, loaded.getDescription().status());
  }

  @Test
  void should_list_agents_with_cache() {
    project.createAgent(
        new AgentDescription(
            "Gate", AgentDescription.Role.GATE, "FAST", AgentDescription.Status.PENDING, null));

    int first = project.agents().findAll().size();
    int second = project.agents().findAll().size();

    assertEquals(first, second);
    assertTrue(first >= 1);
  }
}
