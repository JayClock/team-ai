package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.BizDiagramApi;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

@Relation(collectionRelation = "projects")
public class ProjectModel extends RepresentationModel<ProjectModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private ProjectDescription description;

  public ProjectModel(User user, Project project, UriInfo uriInfo) {
    this.id = project.getIdentity();
    this.description = project.getDescription();
  }

  public static ProjectModel of(User user, Project project, UriInfo uriInfo) {
    ProjectModel model = new ProjectModel(user, project, uriInfo);
    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.project(uriInfo)
                            .build(user.getIdentity(), project.getIdentity())
                            .getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(Project.ProjectChange.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-project")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.conversations(uriInfo)
                            .build(user.getIdentity(), project.getIdentity())
                            .getPath())
                    .withRel("conversations"))
            .afford(HttpMethod.POST)
            .withInput(Conversation.ConversationChange.class)
            .withName("create-conversation")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(
                        ApiTemplates.bizDiagrams(uriInfo)
                            .build(user.getIdentity(), project.getIdentity())
                            .getPath())
                    .withRel("biz-diagrams"))
            .afford(HttpMethod.POST)
            .withInput(BizDiagramApi.BizDiagramChange.class)
            .withName("create-biz-diagram")
            .toLink());

    return model;
  }

  public static ProjectModel simple(User user, Project project, UriInfo uriInfo) {
    ProjectModel model = new ProjectModel(user, project, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.project(uriInfo)
                    .build(user.getIdentity(), project.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
