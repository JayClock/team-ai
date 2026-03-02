package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.teamai.api.representation.OrchestrationModel;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;

public class OrchestrationApi {
  private static final Set<OrchestrationSessionDescription.Status> CANCELLABLE =
      EnumSet.of(
          OrchestrationSessionDescription.Status.PENDING,
          OrchestrationSessionDescription.Status.RUNNING,
          OrchestrationSessionDescription.Status.REVIEW_REQUIRED);

  private final Project project;
  private final OrchestrationSession session;

  public OrchestrationApi(Project project, OrchestrationSession session) {
    this.project = project;
    this.session = session;
  }

  @GET
  @VendorMediaType(ResourceTypes.ORCHESTRATION)
  public OrchestrationModel get(@Context UriInfo uriInfo) {
    return OrchestrationModel.of(project, session, uriInfo);
  }

  @POST
  @Path("cancel")
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ORCHESTRATION)
  public OrchestrationModel cancel(
      @Valid CancelOrchestrationRequest request, @Context UriInfo uriInfo) {
    OrchestrationSessionDescription current = session.getDescription();
    if (!CANCELLABLE.contains(current.status())) {
      throw new WebApplicationException(
          "Cannot cancel orchestration in state " + current.status(), Response.Status.CONFLICT);
    }

    Instant cancelledAt = request.getOccurredAt() == null ? Instant.now() : request.getOccurredAt();
    project.updateOrchestrationSessionStatus(
        session.getIdentity(),
        OrchestrationSessionDescription.Status.CANCELLED,
        current.currentStep(),
        cancelledAt,
        request.getReason());

    OrchestrationSession updated =
        project.orchestrationSessions().findByIdentity(session.getIdentity()).orElse(session);
    return OrchestrationModel.of(project, updated, uriInfo);
  }

  @Data
  @NoArgsConstructor
  public static class CancelOrchestrationRequest {
    @NotBlank private String reason;

    private Instant occurredAt;
  }
}
