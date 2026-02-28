package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.ConversationsApi;
import reengineering.ddd.teamai.api.DiagramsApi;
import reengineering.ddd.teamai.api.LogicalEntitiesApi;
import reengineering.ddd.teamai.api.ProjectApi;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "projects")
public class ProjectModel extends RepresentationModel<ProjectModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private ProjectDescription description;

  @JsonInclude(JsonInclude.Include.NON_NULL)
  @JsonProperty("_embedded")
  private EmbeddedResources embedded;

  public ProjectModel(Project project, UriInfo uriInfo) {
    this.id = project.getIdentity();
    this.description = project.getDescription();
  }

  public static ProjectModel simple(Project project, UriInfo uriInfo) {
    ProjectModel model = new ProjectModel(project, uriInfo);
    model.add(
        Link.of(ApiTemplates.project(uriInfo).build(project.getIdentity()).getPath())
            .withSelfRel());
    return model;
  }

  public static ProjectModel of(Project project, UriInfo uriInfo) {
    ProjectModel model = new ProjectModel(project, uriInfo);
    model.embedded = new EmbeddedResources(sidebar(project, uriInfo));
    model.add(
        Affordances.of(
                Link.of(ApiTemplates.project(uriInfo).build(project.getIdentity()).getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(ProjectApi.UpdateProjectRequest.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-project")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.conversations(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("conversations"))
            .afford(HttpMethod.POST)
            .withInput(ConversationsApi.CreateConversationRequest.class)
            .withName("create-conversation")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.diagrams(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("diagrams"))
            .afford(HttpMethod.POST)
            .withInput(DiagramsApi.CreateDiagramRequest.class)
            .withName("create-diagram")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.logicalEntities(uriInfo)
                            .build(project.getIdentity())
                            .getPath())
                    .withRel("logical-entities"))
            .afford(HttpMethod.POST)
            .withInput(LogicalEntitiesApi.CreateLogicalEntityRequest.class)
            .withName("create-logical-entity")
            .toLink());

    model.add(Link.of(ApiTemplates.projects(uriInfo).build().getPath()).withRel("collection"));
    model.add(
        Link.of(
                ApiTemplates.project(uriInfo)
                    .path("sidebar")
                    .build(project.getIdentity())
                    .getPath())
            .withRel("sidebar"));

    return model;
  }

  private static Sidebar sidebar(Project project, UriInfo uriInfo) {
    String sidebarPath =
        ApiTemplates.project(uriInfo).path("sidebar").build(project.getIdentity()).getPath();
    String conversationsPath =
        ApiTemplates.conversations(uriInfo).build(project.getIdentity()).getPath();
    String diagramsPath = ApiTemplates.diagrams(uriInfo).build(project.getIdentity()).getPath();

    return new Sidebar(
        new SidebarLinks(Link.of(sidebarPath)),
        List.of(
            new SidebarSection(
                "PROJECT",
                "project",
                true,
                List.of(
                    new SidebarItem("Diagrams", diagramsPath, "workflow"),
                    new SidebarItem("Conversations", conversationsPath, "messages-square")))));
  }

  private record EmbeddedResources(@JsonProperty("sidebar") Sidebar sidebar) {}

  private record Sidebar(
      @JsonProperty("_links") SidebarLinks links,
      @JsonProperty("sections") List<SidebarSection> sections) {}

  private record SidebarLinks(@JsonProperty("self") Link self) {}

  private record SidebarSection(
      @JsonProperty("title") String title,
      @JsonProperty("key") String key,
      @JsonProperty("defaultOpen") boolean defaultOpen,
      @JsonProperty("items") List<SidebarItem> items) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  private record SidebarItem(
      @JsonProperty("label") String label,
      @JsonProperty("path") String path,
      @JsonProperty("icon") String icon) {}
}
