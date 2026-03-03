package reengineering.ddd.teamai.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
  private static final long STREAM_POLL_INTERVAL_MILLIS = 1000;
  private static final int STREAM_HEARTBEAT_TICKS = 15;
  private static final ExecutorService STREAM_EXECUTOR = Executors.newCachedThreadPool();

  @Context ResourceContext resourceContext;
  @Inject ObjectMapper objectMapper;

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

  @GET
  @Path("stream")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void stream(
      @Context UriInfo uriInfo,
      @Context SseEventSink sseEventSink,
      @Context Sse sse,
      @HeaderParam("Last-Event-ID") String lastEventId,
      @QueryParam("since") String sinceEventId,
      @DefaultValue("false") @QueryParam("once") boolean once) {
    String resumeFrom = blankToNull(sinceEventId);
    if (resumeFrom == null) {
      resumeFrom = blankToNull(lastEventId);
    }
    String finalResumeFrom = resumeFrom;
    STREAM_EXECUTOR.submit(() -> streamLoop(uriInfo, sseEventSink, sse, finalResumeFrom, once));
  }

  private void streamLoop(
      UriInfo uriInfo, SseEventSink sseEventSink, Sse sse, String resumeFrom, boolean once) {
    try {
      var baselineEvents = project.events().findAll().stream().toList();
      Set<String> delivered = new HashSet<>();
      for (AgentEvent baselineEvent : baselineEvents) {
        delivered.add(baselineEvent.getIdentity());
      }

      int replayStart = replayStartIndex(baselineEvents, resumeFrom);
      sendSnapshot(
          sseEventSink, sse, baselineEvents, resumeFrom, replayStart > 0 ? "resume" : "initial");
      for (int index = replayStart; index < baselineEvents.size(); index++) {
        sendAgentEvent(sseEventSink, sse, baselineEvents.get(index));
      }
      if (once) {
        sseEventSink.close();
        return;
      }

      int ticks = 0;
      while (!sseEventSink.isClosed()) {
        Thread.sleep(STREAM_POLL_INTERVAL_MILLIS);
        ticks++;
        var events = project.events().findAll().stream().toList();
        for (AgentEvent event : events) {
          if (delivered.add(event.getIdentity())) {
            sendAgentEvent(sseEventSink, sse, event);
          }
        }
        if (ticks % STREAM_HEARTBEAT_TICKS == 0) {
          sendTextEvent(sseEventSink, sse, "heartbeat", "");
        }
      }
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      sendTextEvent(sseEventSink, sse, "error", "stream interrupted");
      sseEventSink.close();
    } catch (RuntimeException error) {
      sendTextEvent(sseEventSink, sse, "error", error.getMessage());
      sseEventSink.close();
    }
  }

  private int replayStartIndex(java.util.List<AgentEvent> events, String resumeFrom) {
    if (resumeFrom == null) {
      return 0;
    }
    for (int index = 0; index < events.size(); index++) {
      if (resumeFrom.equals(events.get(index).getIdentity())) {
        return index + 1;
      }
    }
    return 0;
  }

  private void sendSnapshot(
      SseEventSink sseEventSink,
      Sse sse,
      java.util.List<AgentEvent> events,
      String resumeFrom,
      String mode) {
    String latestEventId = events.isEmpty() ? null : events.get(events.size() - 1).getIdentity();
    SnapshotPayload payload =
        new SnapshotPayload(
            project.getIdentity(), mode, resumeFrom, latestEventId, events.size(), Instant.now());
    sendJsonEvent(sseEventSink, sse, "snapshot", payload, null);
  }

  private void sendAgentEvent(SseEventSink sseEventSink, Sse sse, AgentEvent event) {
    AgentEventDescription description = event.getDescription();
    AgentEventPayload payload =
        new AgentEventPayload(
            event.getIdentity(),
            project.getIdentity(),
            description.type().name(),
            description.agent() == null ? null : description.agent().id(),
            description.task() == null ? null : description.task().id(),
            description.message(),
            description.occurredAt());
    sendJsonEvent(sseEventSink, sse, "agent-event", payload, event.getIdentity());
  }

  private void sendJsonEvent(
      SseEventSink sseEventSink, Sse sse, String eventName, Object payload, String id) {
    try {
      String body = objectMapper.writeValueAsString(payload);
      OutboundSseEvent.Builder builder =
          sse.newEventBuilder().name(eventName).data(String.class, body);
      if (id != null && !id.isBlank()) {
        builder.id(id);
      }
      sseEventSink.send(builder.build());
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Failed to serialize SSE payload", error);
    }
  }

  private void sendTextEvent(SseEventSink sseEventSink, Sse sse, String eventName, String data) {
    if (sseEventSink.isClosed()) {
      return;
    }
    OutboundSseEvent event =
        sse.newEventBuilder().name(eventName).data(String.class, data == null ? "" : data).build();
    sseEventSink.send(event);
  }

  private Ref<String> toRef(String id) {
    if (id == null || id.isBlank()) {
      return null;
    }
    return new Ref<>(id);
  }

  private String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
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

  private record SnapshotPayload(
      String projectId,
      String mode,
      String resumeFromEventId,
      String latestEventId,
      int totalEvents,
      Instant emittedAt) {}

  private record AgentEventPayload(
      String id,
      String projectId,
      String type,
      String agentId,
      String taskId,
      String message,
      Instant occurredAt) {}
}
