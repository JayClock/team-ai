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
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.application.OrchestrationRuntimeService;
import reengineering.ddd.teamai.api.representation.OrchestrationModel;
import reengineering.ddd.teamai.description.AgentDescription;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.description.OrchestrationSessionDescription;
import reengineering.ddd.teamai.description.TaskDescription;
import reengineering.ddd.teamai.model.Agent;
import reengineering.ddd.teamai.model.AgentRuntimeException;
import reengineering.ddd.teamai.model.AgentRuntimeTimeoutException;
import reengineering.ddd.teamai.model.OrchestrationSession;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.Task;

public class OrchestrationsApi {
  private static final String DEFAULT_ROUTA_NAME = "Routa Coordinator";
  private static final String DEFAULT_CRAFTER_NAME = "Crafter Implementer";

  private final Project project;
  @Inject OrchestrationRuntimeService orchestrationRuntimeService;
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
      Ref<String> coordinator = ensureCoordinator(request.getCoordinatorAgentId());
      Ref<String> implementer = ensureImplementer(request.getImplementerAgentId());
      Instant occurredAt =
          request.getOccurredAt() == null ? Instant.now() : request.getOccurredAt();

      Task task = project.createTask(toTaskDescription(request));
      Ref<String> taskRef = new Ref<>(task.getIdentity());

      project.appendEvent(
          new AgentEventDescription(
              AgentEventDescription.Type.MESSAGE_SENT,
              coordinator,
              taskRef,
              request.getGoal(),
              occurredAt));

      project.delegateTaskForExecution(task.getIdentity(), implementer, coordinator, occurredAt);

      OrchestrationSession session =
          project.startOrchestrationSession(
              new OrchestrationSessionDescription(
                  request.getGoal(),
                  OrchestrationSessionDescription.Status.RUNNING,
                  coordinator,
                  implementer,
                  taskRef,
                  null,
                  occurredAt,
                  null,
                  null));

      try {
        orchestrationRuntimeService.onSessionStarted(project, session, occurredAt);
      } catch (AgentRuntimeTimeoutException error) {
        throw new WebApplicationException(
            "Failed to start orchestration runtime: " + error.getMessage(),
            Response.Status.GATEWAY_TIMEOUT);
      } catch (AgentRuntimeException error) {
        throw new WebApplicationException(
            "Failed to start orchestration runtime: " + error.getMessage(),
            Response.Status.BAD_GATEWAY);
      }

      return Response.created(
              ApiTemplates.orchestration(uriInfo)
                  .build(project.getIdentity(), session.getIdentity()))
          .entity(OrchestrationModel.of(project, session, uriInfo))
          .build();
    } catch (IllegalArgumentException error) {
      throw new BadRequestException(error.getMessage());
    } catch (IllegalStateException error) {
      throw new WebApplicationException(error.getMessage(), Response.Status.CONFLICT);
    }
  }

  private TaskDescription toTaskDescription(StartOrchestrationRequest request) {
    return new TaskDescription(
        resolveTitle(request),
        request.getGoal(),
        normalizeText(request.getScope()),
        request.getAcceptanceCriteria(),
        request.getVerificationCommands(),
        TaskDescription.Status.PENDING,
        null,
        null,
        null,
        null,
        null);
  }

  private Ref<String> ensureCoordinator(String explicitAgentId) {
    if (explicitAgentId != null && !explicitAgentId.isBlank()) {
      Agent agent =
          project
              .agents()
              .findByIdentity(explicitAgentId)
              .orElseThrow(
                  () -> new IllegalArgumentException("Coordinator not found: " + explicitAgentId));
      ensureDelegatorRole(agent);
      return new Ref<>(agent.getIdentity());
    }

    Optional<Agent> existing =
        project.agents().findAll().stream()
            .filter(agent -> agent.getDescription().role() == AgentDescription.Role.ROUTA)
            .findFirst();

    if (existing.isPresent()) {
      return new Ref<>(existing.get().getIdentity());
    }

    Agent created =
        project.createAgent(
            new AgentDescription(
                DEFAULT_ROUTA_NAME,
                AgentDescription.Role.ROUTA,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_CREATED,
            new Ref<>(created.getIdentity()),
            null,
            "Default coordinator agent created by orchestration",
            Instant.now()));
    return new Ref<>(created.getIdentity());
  }

  private Ref<String> ensureImplementer(String explicitAgentId) {
    if (explicitAgentId != null && !explicitAgentId.isBlank()) {
      Agent agent =
          project
              .agents()
              .findByIdentity(explicitAgentId)
              .orElseThrow(
                  () -> new IllegalArgumentException("Implementer not found: " + explicitAgentId));
      ensureImplementerRole(agent);
      return new Ref<>(agent.getIdentity());
    }

    Optional<Agent> existing =
        project.agents().findAll().stream()
            .filter(agent -> isImplementerRole(agent.getDescription().role()))
            .findFirst();

    if (existing.isPresent()) {
      return new Ref<>(existing.get().getIdentity());
    }

    Agent created =
        project.createAgent(
            new AgentDescription(
                DEFAULT_CRAFTER_NAME,
                AgentDescription.Role.CRAFTER,
                "SMART",
                AgentDescription.Status.PENDING,
                null));
    project.appendEvent(
        new AgentEventDescription(
            AgentEventDescription.Type.AGENT_CREATED,
            new Ref<>(created.getIdentity()),
            null,
            "Default implementer agent created by orchestration",
            Instant.now()));
    return new Ref<>(created.getIdentity());
  }

  private boolean isImplementerRole(AgentDescription.Role role) {
    return role == AgentDescription.Role.CRAFTER || role == AgentDescription.Role.DEVELOPER;
  }

  private void ensureImplementerRole(Agent agent) {
    if (!isImplementerRole(agent.getDescription().role())) {
      throw new IllegalStateException(
          "implementer role must be one of [CRAFTER, DEVELOPER], but was "
              + agent.getDescription().role());
    }
  }

  private void ensureDelegatorRole(Agent agent) {
    if (agent.getDescription().role() == AgentDescription.Role.GATE) {
      throw new IllegalStateException(
          "coordinator role must be one of [ROUTA, CRAFTER, DEVELOPER], but was GATE");
    }
  }

  private String resolveTitle(StartOrchestrationRequest request) {
    String explicit = normalizeText(request.getTitle());
    if (explicit != null) {
      return explicit;
    }

    String goal = request.getGoal().trim();
    return goal.length() <= 120 ? goal : goal.substring(0, 120);
  }

  private String normalizeText(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  @Data
  @NoArgsConstructor
  public static class StartOrchestrationRequest {
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
