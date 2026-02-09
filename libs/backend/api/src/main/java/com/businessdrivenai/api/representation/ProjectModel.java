package com.businessdrivenai.api.representation;

import com.businessdrivenai.api.ApiTemplates;
import com.businessdrivenai.api.DiagramsApi;
import com.businessdrivenai.api.LogicalEntitiesApi;
import com.businessdrivenai.domain.description.ProjectDescription;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.domain.model.Project;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;

@Relation(collectionRelation = "projects")
public class ProjectModel extends RepresentationModel<ProjectModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private ProjectDescription description;

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
    model.add(
        Affordances.of(
                Link.of(ApiTemplates.project(uriInfo).build(project.getIdentity()).getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(Project.ProjectChange.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-project")
            .toLink());

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.conversations(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("conversations"))
            .afford(HttpMethod.POST)
            .withInput(Conversation.ConversationChange.class)
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

    return model;
  }
}
