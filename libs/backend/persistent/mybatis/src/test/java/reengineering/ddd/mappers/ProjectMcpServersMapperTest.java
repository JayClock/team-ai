package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.model.McpServer;
import reengineering.ddd.teamai.mybatis.mappers.ProjectMcpServersMapper;

@MybatisTest
@Import(TestContainerConfig.class)
class ProjectMcpServersMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private ProjectMcpServersMapper mapper;

  private final int userId = id();
  private final int projectId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertProject(projectId, userId, "Project " + projectId);
  }

  @Test
  void should_insert_find_update_and_delete_mcp_server() {
    IdHolder holder = new IdHolder();
    mapper.insertMcpServer(
        holder,
        projectId,
        new McpServerDescription(
            "Local FS",
            McpServerDescription.Transport.STDIO,
            "npx -y @modelcontextprotocol/server-filesystem .",
            true));

    McpServer saved = mapper.findMcpServerByProjectAndId(projectId, holder.id());
    assertEquals("Local FS", saved.getDescription().name());
    assertEquals(McpServerDescription.Transport.STDIO, saved.getDescription().transport());

    mapper.updateMcpServer(
        projectId,
        holder.id(),
        new McpServerDescription(
            "Local HTTP",
            McpServerDescription.Transport.HTTP,
            "http://localhost:11434/mcp",
            false));

    McpServer updated = mapper.findMcpServerByProjectAndId(projectId, holder.id());
    assertEquals("Local HTTP", updated.getDescription().name());
    assertEquals(McpServerDescription.Transport.HTTP, updated.getDescription().transport());
    assertEquals(false, updated.getDescription().enabled());

    assertEquals(1, mapper.countMcpServersByProject(projectId));
    assertEquals(1, mapper.findMcpServersByProjectId(projectId, 0, 10).size());

    mapper.deleteMcpServer(projectId, holder.id());
    assertTrue(mapper.findMcpServersByProjectId(projectId, 0, 10).isEmpty());
  }
}
