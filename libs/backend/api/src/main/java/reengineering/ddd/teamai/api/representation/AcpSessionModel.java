package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.AcpSessionDescription;
import reengineering.ddd.teamai.model.AcpSession;
import reengineering.ddd.teamai.model.Project;

@Relation(collectionRelation = "sessions")
public class AcpSessionModel extends RepresentationModel<AcpSessionModel> {
  @JsonProperty private String id;
  @JsonProperty private Ref<String> project;
  @JsonProperty private Ref<String> actor;
  @JsonProperty private String provider;
  @JsonProperty private String mode;
  @JsonProperty private String state;
  @JsonProperty private Instant startedAt;
  @JsonProperty private Instant lastActivityAt;
  @JsonProperty private Instant completedAt;
  @JsonProperty private String failureReason;
  @JsonProperty private String lastEventId;

  private AcpSessionModel(AcpSession session) {
    AcpSessionDescription description = session.getDescription();
    this.id = session.getIdentity();
    this.project = description.project();
    this.actor = description.actor();
    this.provider = description.provider();
    this.mode = description.mode();
    this.state = description.status().name();
    this.startedAt = description.startedAt();
    this.lastActivityAt = description.lastActivityAt();
    this.completedAt = description.completedAt();
    this.failureReason = description.failureReason();
    this.lastEventId = description.lastEventId();
  }

  public static AcpSessionModel simple(Project project, AcpSession session, UriInfo uriInfo) {
    AcpSessionModel model = new AcpSessionModel(session);
    model.add(
        Link.of(
                ApiTemplates.session(uriInfo)
                    .build(project.getIdentity(), session.getIdentity())
                    .getPath())
            .withSelfRel());
    return model;
  }

  public static AcpSessionModel of(Project project, AcpSession session, UriInfo uriInfo) {
    AcpSessionModel model = simple(project, session, uriInfo);
    model.add(
        Link.of(ApiTemplates.sessions(uriInfo).build(project.getIdentity()).getPath())
            .withRel("collection"));
    return model;
  }
}
