package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "events")
public class AgentEventModel extends RepresentationModel<AgentEventModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private AgentEventDescription description;
  @JsonProperty private Ref<String> project;

  public AgentEventModel(Project project, AgentEvent event, UriInfo uriInfo) {
    this.id = event.getIdentity();
    this.description = event.getDescription();
    this.project = new Ref<>(project.getIdentity());
  }

  public static AgentEventModel of(Project project, AgentEvent event, UriInfo uriInfo) {
    AgentEventModel model = new AgentEventModel(project, event, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.event(uriInfo)
                    .build(project.getIdentity(), event.getIdentity())
                    .getPath())
            .withSelfRel());
    model.add(
        Link.of(ApiTemplates.events(uriInfo).build(project.getIdentity()).getPath())
            .withRel("collection"));
    return model;
  }

  public static AgentEventModel simple(Project project, AgentEvent event, UriInfo uriInfo) {
    AgentEventModel model = new AgentEventModel(project, event, uriInfo);
    model.add(
        Link.of(
                ApiTemplates.event(uriInfo)
                    .build(project.getIdentity(), event.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }
}
