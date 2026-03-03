package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.teamai.api.representation.ProjectModel;
import reengineering.ddd.teamai.model.Project;

public class ProjectApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public ProjectApi(Project project) {
    this.project = project;
  }

  @GET
  @VendorMediaType(ResourceTypes.PROJECT)
  public ProjectModel find(@Context UriInfo uriInfo) {
    return ProjectModel.of(project, uriInfo);
  }

  @Path("conversations")
  public ConversationsApi conversations() {
    return resourceContext.initResource(new ConversationsApi(project));
  }

  @Path("logical-entities")
  public LogicalEntitiesApi logicalEntities() {
    return resourceContext.initResource(new LogicalEntitiesApi(project));
  }

  @Path("diagrams")
  public DiagramsApi diagrams() {
    return resourceContext.initResource(new DiagramsApi(project));
  }

  @Path("agents")
  public AgentsApi agents() {
    return resourceContext.initResource(new AgentsApi(project));
  }

  @Path("tasks")
  public TasksApi tasks() {
    return resourceContext.initResource(new TasksApi(project));
  }

  @Path("events")
  public AgentEventsApi events() {
    return resourceContext.initResource(new AgentEventsApi(project));
  }

  @Path("sessions")
  public SessionsApi sessions() {
    return resourceContext.initResource(new SessionsApi(project));
  }

  @Path("orchestrations")
  public OrchestrationsApi orchestrations() {
    return resourceContext.initResource(new OrchestrationsApi(project));
  }

  @Path("mcp-servers")
  public McpServersApi mcpServers() {
    return resourceContext.initResource(new McpServersApi(project));
  }

  @Path("knowledge-graph")
  public KnowledgeGraphApi knowledgeGraph() {
    return resourceContext.initResource(new KnowledgeGraphApi(project));
  }

  @Data
  @NoArgsConstructor
  public static class UpdateProjectRequest {
    private String name;
  }
}
