package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.OrchestrationApi;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.TaskSpecDescription;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "orchestrations")
public class OrchestrationModel extends RepresentationModel<OrchestrationModel> {
  private static final Set<OrchestrationSessionDescription.Status> CANCELLABLE =
      EnumSet.of(
          OrchestrationSessionDescription.Status.PENDING,
          OrchestrationSessionDescription.Status.RUNNING,
          OrchestrationSessionDescription.Status.REVIEW_REQUIRED);

  @JsonProperty private String id;
  @JsonProperty private String goal;
  @JsonProperty private String state;
  @JsonProperty private Ref<String> coordinator;
  @JsonProperty private Ref<String> implementer;
  @JsonProperty private Ref<String> task;
  @JsonProperty private TaskSpecDescription spec;
  @JsonProperty private Ref<String> currentStep;
  @JsonProperty private Instant startedAt;
  @JsonProperty private Instant completedAt;
  @JsonProperty private String failureReason;

  private OrchestrationModel(OrchestrationSession session) {
    OrchestrationSessionDescription description = session.getDescription();
    this.id = session.getIdentity();
    this.goal = description.goal();
    this.state = toState(description.status());
    this.coordinator = description.coordinator();
    this.implementer = description.implementer();
    this.task = description.task();
    this.spec = description.spec();
    this.currentStep = description.currentStep();
    this.startedAt = description.startedAt();
    this.completedAt = description.completedAt();
    this.failureReason = description.failureReason();
  }

  public static OrchestrationModel simple(
      Project project, OrchestrationSession session, UriInfo uriInfo) {
    OrchestrationModel model = new OrchestrationModel(session);
    model.add(
        Link.of(
                ApiTemplates.orchestration(uriInfo)
                    .build(project.getIdentity(), session.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }

  public static OrchestrationModel of(
      Project project, OrchestrationSession session, UriInfo uriInfo) {
    OrchestrationModel model = simple(project, session, uriInfo);

    model.add(
        Link.of(ApiTemplates.orchestrations(uriInfo).build(project.getIdentity()).getPath())
            .withRel("collection"));
    model.add(
        Link.of(ApiTemplates.tasks(uriInfo).build(project.getIdentity()).getPath())
            .withRel("tasks"));
    model.add(
        Link.of(ApiTemplates.events(uriInfo).build(project.getIdentity()).getPath())
            .withRel("events"));
    model.add(
        Link.of(ApiTemplates.agents(uriInfo).build(project.getIdentity()).getPath())
            .withRel("agents"));

    if (CANCELLABLE.contains(session.getDescription().status())) {
      model.add(
          Affordances.of(
                  Link.of(
                          ApiTemplates.orchestration(uriInfo)
                              .path(OrchestrationApi.class, "cancel")
                              .build(project.getIdentity(), session.getIdentity())
                              .getPath())
                      .withRel("cancel"))
              .afford(HttpMethod.POST)
              .withInput(OrchestrationApi.CancelOrchestrationRequest.class)
              .withName("cancel-orchestration")
              .toLink());
    }

    return model;
  }

  private static String toState(OrchestrationSessionDescription.Status status) {
    return status.name();
  }
}
