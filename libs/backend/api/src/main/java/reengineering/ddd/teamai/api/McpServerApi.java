package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.Optional;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.teamai.api.representation.McpServerModel;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.model.McpServer;
import reengineering.ddd.teamai.model.Project;

public class McpServerApi {
  private final Project project;
  private final McpServer server;

  public McpServerApi(Project project, McpServer server) {
    this.project = project;
    this.server = server;
  }

  @GET
  @VendorMediaType(ResourceTypes.MCP_SERVER)
  public McpServerModel get(@Context UriInfo uriInfo) {
    return McpServerModel.of(project, server, uriInfo);
  }

  @PUT
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MCP_SERVER)
  public McpServerModel update(@Valid UpdateMcpServerRequest request, @Context UriInfo uriInfo) {
    McpServerDescription description =
        new McpServerDescription(
            McpServerValidation.normalize(request.getName()),
            request.getTransport(),
            McpServerValidation.normalize(request.getTarget()),
            request.getEnabled() == null || request.getEnabled());
    McpServerValidation.validate(description);
    project.updateMcpServer(server.getIdentity(), description);

    Optional<McpServer> reloaded = project.mcpServers().findByIdentity(server.getIdentity());
    return McpServerModel.of(project, reloaded.orElse(server), uriInfo);
  }

  @DELETE
  @VendorMediaType(ResourceTypes.MCP_SERVER)
  public Response delete() {
    project.deleteMcpServer(server.getIdentity());
    return Response.noContent().build();
  }

  @Data
  @NoArgsConstructor
  public static class UpdateMcpServerRequest {
    @NotBlank private String name;
    @NotNull private McpServerDescription.Transport transport;
    @NotBlank private String target;
    private Boolean enabled;
  }
}
