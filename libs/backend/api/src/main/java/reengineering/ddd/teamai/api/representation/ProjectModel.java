package reengineering.ddd.teamai.api.representation;

import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;

import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

@Relation(collectionRelation = "projects")
public class ProjectModel extends RepresentationModel<ProjectModel> {
  @JsonProperty
  private String id;
  @JsonUnwrapped
  private ProjectDescription description;

  public ProjectModel(User user, Project project, UriInfo uriInfo) {
    this.id = project.getIdentity();
    this.description = project.getDescription();

    Link selfRel = Link.of(
        ApiTemplates.project(uriInfo)
            .build(user.getIdentity(), project.getIdentity())
            .getPath())
        .withSelfRel();
    Link conversationsRel = Link.of(
        ApiTemplates.projectConversations(uriInfo)
            .build(user.getIdentity(), project.getIdentity())
            .getPath())
        .withRel("conversations");

    add(Affordances.of(selfRel).afford(HttpMethod.PUT).withInput(Project.ProjectChange.class)
        .andAfford(HttpMethod.DELETE).withName("delete-project").toLink());

    add(
        Affordances.of(conversationsRel)
            .afford(HttpMethod.POST)
            .withInput(ConversationDescription.class)
            .withName("create-conversation")
            .toLink());
  }

}
