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
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.model.McpServer;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;
import reengineering.ddd.teamai.mybatis.config.CacheConfig;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class, TestCacheConfig.class, CacheConfig.class})
@ExtendWith(TestDataSetup.class)
class ProjectMcpServersTest {
  @Inject private Users users;
  @Inject private CacheManager cacheManager;

  private Project project;

  @BeforeEach
  void setup() {
    cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    User user = users.findByIdentity("1").orElseThrow();
    project = user.projects().findAll().stream().findFirst().orElseThrow();
  }

  @Test
  void should_create_update_and_delete_mcp_server() {
    McpServer created =
        project.createMcpServer(
            new McpServerDescription(
                "Local FS",
                McpServerDescription.Transport.STDIO,
                "npx -y @modelcontextprotocol/server-filesystem .",
                true));

    McpServer loaded = project.mcpServers().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals("Local FS", loaded.getDescription().name());
    assertEquals(McpServerDescription.Transport.STDIO, loaded.getDescription().transport());

    project.updateMcpServer(
        created.getIdentity(),
        new McpServerDescription(
            "Local HTTP",
            McpServerDescription.Transport.HTTP,
            "http://localhost:11434/mcp",
            false));

    McpServer updated = project.mcpServers().findByIdentity(created.getIdentity()).orElseThrow();
    assertEquals("Local HTTP", updated.getDescription().name());
    assertEquals(McpServerDescription.Transport.HTTP, updated.getDescription().transport());
    assertEquals(false, updated.getDescription().enabled());

    project.deleteMcpServer(created.getIdentity());
    assertTrue(project.mcpServers().findByIdentity(created.getIdentity()).isEmpty());
  }
}
