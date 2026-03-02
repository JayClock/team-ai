package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "orchestrations")
public class OrchestrationModel extends RepresentationModel<OrchestrationModel> {
  @JsonProperty private String goal;
  @JsonProperty private String state;
  @JsonProperty private Ref<String> coordinator;
  @JsonProperty private Ref<String> implementer;
  @JsonProperty private Ref<String> task;

  private OrchestrationModel(
      String goal,
      String state,
      Ref<String> coordinator,
      Ref<String> implementer,
      Ref<String> task) {
    this.goal = goal;
    this.state = state;
    this.coordinator = coordinator;
    this.implementer = implementer;
    this.task = task;
  }

  public static OrchestrationModel started(
      Project project,
      String goal,
      Ref<String> coordinator,
      Ref<String> implementer,
      Ref<String> task,
      UriInfo uriInfo) {
    OrchestrationModel model =
        new OrchestrationModel(goal, "STARTED", coordinator, implementer, task);

    model.add(
        Link.of(ApiTemplates.task(uriInfo).build(project.getIdentity(), task.id()).getPath())
            .withSelfRel());
    model.add(
        Link.of(ApiTemplates.tasks(uriInfo).build(project.getIdentity()).getPath())
            .withRel("tasks"));
    model.add(
        Link.of(ApiTemplates.events(uriInfo).build(project.getIdentity()).getPath())
            .withRel("events"));
    model.add(
        Link.of(ApiTemplates.agents(uriInfo).build(project.getIdentity()).getPath())
            .withRel("agents"));
    return model;
  }
}
