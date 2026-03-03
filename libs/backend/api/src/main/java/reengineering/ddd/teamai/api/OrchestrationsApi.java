package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.application.OrchestrationService;
import reengineering.ddd.teamai.api.representation.OrchestrationModel;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;

public class OrchestrationsApi {
  private final Project project;

  @Inject OrchestrationService orchestrationService;
  @Context ResourceContext resourceContext;

  public OrchestrationsApi(Project project) {
    this.project = project;
  }

  @Path("{orchestration-id}")
  public OrchestrationApi findById(@PathParam("orchestration-id") String id) {
    return project
        .orchestrationSessions()
        .findByIdentity(id)
        .map(
            session -> {
              OrchestrationApi api = new OrchestrationApi(project, session);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  @VendorMediaType(ResourceTypes.ORCHESTRATION_COLLECTION)
  public CollectionModel<OrchestrationModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    CollectionModel<OrchestrationModel> model =
        new Pagination<>(project.orchestrationSessions().findAll(), 40)
            .page(
                page,
                session -> OrchestrationModel.simple(project, session, uriInfo),
                p ->
                    ApiTemplates.orchestrations(uriInfo)
                        .queryParam("page", p)
                        .build(project.getIdentity()));

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.orchestrations(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("start-orchestration"))
            .afford(HttpMethod.POST)
            .withInput(StartOrchestrationRequest.class)
            .withName("start-orchestration")
            .toLink());
    return model;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.ORCHESTRATION)
  public Response start(@Valid StartOrchestrationRequest request, @Context UriInfo uriInfo) {
    try {
      String requestId = normalizeRequestId(request.getRequestId());
      if (requestId != null) {
        Optional<OrchestrationSession> replayed =
            Optional.ofNullable(project.orchestrationSessions().findByStartRequestId(requestId))
                .orElse(Optional.empty());
        if (replayed.isPresent()) {
          return Response.ok(OrchestrationModel.of(project, replayed.get(), uriInfo)).build();
        }
      }

      OrchestrationSession session =
          orchestrationService.start(
              project,
              new OrchestrationService.StartCommand(
                  requestId,
                  request.getGoal(),
                  request.getTitle(),
                  request.getScope(),
                  request.getAcceptanceCriteria(),
                  request.getVerificationCommands(),
                  request.getCoordinatorAgentId(),
                  request.getImplementerAgentId(),
                  request.getOccurredAt()));

      return Response.created(
              ApiTemplates.orchestration(uriInfo)
                  .build(project.getIdentity(), session.getIdentity()))
          .entity(OrchestrationModel.of(project, session, uriInfo))
          .build();
    } catch (IllegalArgumentException error) {
      throw new BadRequestException(error.getMessage());
    } catch (IllegalStateException error) {
      throw new WebApplicationException(error.getMessage(), Response.Status.CONFLICT);
    } catch (AgentRuntimeTimeoutException error) {
      throw new WebApplicationException(
          "Failed to start orchestration runtime: " + error.getMessage(),
          Response.Status.GATEWAY_TIMEOUT);
    } catch (AgentRuntimeException error) {
      throw new WebApplicationException(
          "Failed to start orchestration runtime: " + error.getMessage(),
          Response.Status.BAD_GATEWAY);
    }
  }

  private String normalizeRequestId(String requestId) {
    if (requestId == null) {
      return null;
    }
    String normalized = requestId.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  @Data
  @NoArgsConstructor
  public static class StartOrchestrationRequest {
    private String requestId;

    @NotBlank private String goal;

    private String title;
    private String scope;
    private List<String> acceptanceCriteria;
    private List<String> verificationCommands;
    private String coordinatorAgentId;
    private String implementerAgentId;
    private Instant occurredAt;
  }
}
