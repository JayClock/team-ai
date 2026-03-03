package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.representation.McpServerModel;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.model.McpServer;
import reengineering.ddd.teamai.model.Project;

public class McpServersApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public McpServersApi(Project project) {
    this.project = project;
  }

  @Path("{server-id}")
  public McpServerApi findById(@PathParam("server-id") String id) {
    return project
        .mcpServers()
        .findByIdentity(id)
        .map(
            server -> {
              McpServerApi api = new McpServerApi(project, server);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  @VendorMediaType(ResourceTypes.MCP_SERVER_COLLECTION)
  public CollectionModel<McpServerModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    CollectionModel<McpServerModel> model =
        new Pagination<>(project.mcpServers().findAll(), 40)
            .page(
                page,
                server -> McpServerModel.simple(project, server, uriInfo),
                p ->
                    ApiTemplates.mcpServers(uriInfo)
                        .queryParam("page", p)
                        .build(project.getIdentity()));

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.mcpServers(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("create-mcp-server"))
            .afford(HttpMethod.POST)
            .withInput(CreateMcpServerRequest.class)
            .andAfford(HttpMethod.POST)
            .withInput(CreateMcpServerRequest.class)
            .withName("create-mcp-server")
            .toLink());

    return model;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateMcpServerRequest request, @Context UriInfo uriInfo) {
    McpServerDescription description =
        new McpServerDescription(
            McpServerValidation.normalize(request.getName()),
            request.getTransport(),
            McpServerValidation.normalize(request.getTarget()),
            request.getEnabled() == null || request.getEnabled());
    McpServerValidation.validate(description);

    McpServer created = project.createMcpServer(description);
    return Response.created(
            ApiTemplates.mcpServer(uriInfo).build(project.getIdentity(), created.getIdentity()))
        .entity(McpServerModel.of(project, created, uriInfo))
        .build();
  }

  @Data
  @NoArgsConstructor
  public static class CreateMcpServerRequest {
    @NotBlank private String name;
    @NotNull private McpServerDescription.Transport transport;
    @NotBlank private String target;
    private Boolean enabled;
  }
}
