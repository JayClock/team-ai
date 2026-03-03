package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.McpServer;
import reengineering.ddd.teamai.model.Project;

class McpServersApiTest extends ApiTest {
  private Project project;
  private McpServer mcpServer;

  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Project.Agents agents;
  @Mock private Project.Tasks tasks;
  @Mock private Project.AgentEvents events;
  @Mock private Project.McpServers mcpServers;

  @BeforeEach
  void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            agents,
            tasks,
            events,
            null,
            mcpServers);
    mcpServer =
        new McpServer(
            "mcp-1",
            new McpServerDescription(
                "Local FS",
                McpServerDescription.Transport.STDIO,
                "npx -y @modelcontextprotocol/server-filesystem .",
                true));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(mcpServers.findAll()).thenReturn(new EntityList<>(mcpServer));
    when(mcpServers.findByIdentity(mcpServer.getIdentity())).thenReturn(Optional.of(mcpServer));
  }

  @Test
  void should_return_mcp_servers_collection_with_create_rel() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/mcp-servers", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded['mcp-servers']", hasSize(1))
        .body("_embedded['mcp-servers'][0].id", is("mcp-1"))
        .body(
            "_links.create-mcp-server.href",
            is("/api/projects/" + project.getIdentity() + "/mcp-servers"));
  }

  @Test
  void should_create_mcp_server() {
    McpServer created =
        new McpServer(
            "mcp-2",
            new McpServerDescription(
                "Local SSE",
                McpServerDescription.Transport.SSE,
                "http://localhost:8081/sse",
                true));
    when(mcpServers.create(any(McpServerDescription.class))).thenReturn(created);

    McpServersApi.CreateMcpServerRequest request = new McpServersApi.CreateMcpServerRequest();
    request.setName("Local SSE");
    request.setTransport(McpServerDescription.Transport.SSE);
    request.setTarget("http://localhost:8081/sse");
    request.setEnabled(true);

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/mcp-servers", project.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is("mcp-2"))
        .body("transport", is("SSE"))
        .body("target", is("http://localhost:8081/sse"));

    ArgumentCaptor<McpServerDescription> captor =
        ArgumentCaptor.forClass(McpServerDescription.class);
    verify(mcpServers).create(captor.capture());
    McpServerDescription description = captor.getValue();
    org.junit.jupiter.api.Assertions.assertEquals(
        McpServerDescription.Transport.SSE, description.transport());
    org.junit.jupiter.api.Assertions.assertEquals(
        "http://localhost:8081/sse", description.target());
  }

  @Test
  void should_reject_non_whitelisted_stdio_command() {
    McpServersApi.CreateMcpServerRequest request = new McpServersApi.CreateMcpServerRequest();
    request.setName("Unsafe");
    request.setTransport(McpServerDescription.Transport.STDIO);
    request.setTarget("bash -lc 'curl http://example.com'");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post("/projects/{projectId}/mcp-servers", project.getIdentity())
        .then()
        .statusCode(400);
  }

  @Test
  void should_update_and_delete_mcp_server() {
    McpServer updated =
        new McpServer(
            "mcp-1",
            new McpServerDescription(
                "Local HTTP",
                McpServerDescription.Transport.HTTP,
                "http://localhost:11434/mcp",
                false));
    when(mcpServers.findByIdentity(mcpServer.getIdentity()))
        .thenReturn(Optional.of(mcpServer), Optional.of(updated), Optional.of(updated));

    McpServerApi.UpdateMcpServerRequest request = new McpServerApi.UpdateMcpServerRequest();
    request.setName("Local HTTP");
    request.setTransport(McpServerDescription.Transport.HTTP);
    request.setTarget("http://localhost:11434/mcp");
    request.setEnabled(false);

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .put(
            "/projects/{projectId}/mcp-servers/{serverId}",
            project.getIdentity(),
            mcpServer.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is("mcp-1"))
        .body("enabled", is(false))
        .body("transport", is("HTTP"));

    verify(mcpServers, times(1)).update(eq("mcp-1"), any(McpServerDescription.class));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .delete(
            "/projects/{projectId}/mcp-servers/{serverId}",
            project.getIdentity(),
            mcpServer.getIdentity())
        .then()
        .statusCode(204);

    verify(mcpServers, times(1)).delete("mcp-1");
  }
}
