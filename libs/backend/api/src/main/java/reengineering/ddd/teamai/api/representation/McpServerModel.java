package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.McpServerApi;
import reengineering.ddd.teamai.description.McpServerDescription;
import reengineering.ddd.teamai.model.McpServer;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "mcp-servers")
public class McpServerModel extends RepresentationModel<McpServerModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private McpServerDescription description;
  @JsonProperty private Ref<String> project;

  public McpServerModel(Project project, McpServer server) {
    this.id = server.getIdentity();
    this.description = server.getDescription();
    this.project = new Ref<>(project.getIdentity());
  }

  public static McpServerModel of(Project project, McpServer server, UriInfo uriInfo) {
    McpServerModel model = new McpServerModel(project, server);
    model.add(
        Link.of(
                ApiTemplates.mcpServer(uriInfo)
                    .build(project.getIdentity(), server.getIdentity())
                    .getPath())
            .withSelfRel());
    model.add(
        Link.of(ApiTemplates.mcpServers(uriInfo).build(project.getIdentity()).getPath())
            .withRel("collection"));
    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.mcpServer(uriInfo)
                            .build(project.getIdentity(), server.getIdentity())
                            .getPath())
                    .withRel("update-mcp-server"))
            .afford(HttpMethod.PUT)
            .withInput(McpServerApi.UpdateMcpServerRequest.class)
            .withName("update-mcp-server")
            .andAfford(HttpMethod.DELETE)
            .withName("delete-mcp-server")
            .toLink());
    return model;
  }

  public static McpServerModel simple(Project project, McpServer server, UriInfo uriInfo) {
    McpServerModel model = new McpServerModel(project, server);
    model.add(
        Link.of(
                ApiTemplates.mcpServer(uriInfo)
                    .build(project.getIdentity(), server.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
