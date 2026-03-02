package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.hateoas.CollectionModel;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.AgentEventModel;
import reengineering.ddd.teamai.description.AgentEventDescription;
import reengineering.ddd.teamai.model.AgentEvent;
import reengineering.ddd.teamai.model.Project;

public class AgentEventsApi {
  @Context ResourceContext resourceContext;

  private final Project project;

  public AgentEventsApi(Project project) {
    this.project = project;
  }

  @Path("{event-id}")
  public AgentEventApi findById(@PathParam("event-id") String id) {
    return project
        .events()
        .findByIdentity(id)
        .map(
            event -> {
              AgentEventApi api = new AgentEventApi(project, event);
              return resourceContext.initResource(api);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  @VendorMediaType(ResourceTypes.AGENT_EVENT_COLLECTION)
  public CollectionModel<AgentEventModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    CollectionModel<AgentEventModel> model =
        new Pagination<>(project.events().findAll(), 40)
            .page(
                page,
                event -> AgentEventModel.simple(project, event, uriInfo),
                p ->
                    ApiTemplates.events(uriInfo)
                        .queryParam("page", p)
                        .build(project.getIdentity()));

    model.add(
        Affordances.of(
                Link.of(ApiTemplates.events(uriInfo).build(project.getIdentity()).getPath())
                    .withRel("create-event"))
            .afford(HttpMethod.POST)
            .withInput(CreateAgentEventRequest.class)
            .andAfford(HttpMethod.POST)
            .withInput(CreateAgentEventRequest.class)
            .withName("create-event")
            .toLink());

    return model;
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(@Valid CreateAgentEventRequest request, @Context UriInfo uriInfo) {
    AgentEventDescription description =
        new AgentEventDescription(
            request.getType(),
            toRef(request.getAgentId()),
            toRef(request.getTaskId()),
            request.getMessage(),
            request.getOccurredAt() == null ? Instant.now() : request.getOccurredAt());

    AgentEvent created = project.appendEvent(description);
    return Response.created(
            ApiTemplates.event(uriInfo).build(project.getIdentity(), created.getIdentity()))
        .entity(AgentEventModel.of(project, created, uriInfo))
        .build();
  }

  private Ref<String> toRef(String id) {
    if (id == null || id.isBlank()) {
      return null;
    }
    return new Ref<>(id);
  }

  @Data
  @NoArgsConstructor
  public static class CreateAgentEventRequest {
    @NotNull private AgentEventDescription.Type type;

    private String agentId;
    private String taskId;
    private String message;
    private Instant occurredAt;
  }
}
