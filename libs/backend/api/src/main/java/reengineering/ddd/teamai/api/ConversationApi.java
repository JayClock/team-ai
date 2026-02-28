package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import lombok.Data;
import lombok.NoArgsConstructor;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.ApiKeyMissingException;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;

public class ConversationApi {
  @Inject private Conversation.ModelProvider modelProvider;

  private final Project project;
  private final Conversation conversation;

  public ConversationApi(Project project, Conversation conversation) {
    this.project = project;
    this.conversation = conversation;
  }

  @GET
  @VendorMediaType(ResourceTypes.CONVERSATION)
  public ConversationModel get(@Context UriInfo uriInfo) {
    return new ConversationModel(project, conversation, uriInfo);
  }

  @DELETE
  public Response delete() {
    project.deleteConversation(conversation.getIdentity());
    return Response.noContent().build();
  }

  @Path("messages")
  public MessagesApi messages() {
    return new MessagesApi(project, conversation);
  }

  @POST
  @Path("messages/stream")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void chat(
      MessageDescription description, @Context SseEventSink sseEventSink, @Context Sse sse) {
    Flux<String> modelResponseStream;

    try {
      modelResponseStream = this.conversation.sendMessage(description, modelProvider);
    } catch (ApiKeyMissingException e) {
      throw new WebApplicationException("Missing API Key", Response.Status.UNAUTHORIZED);
    }

    StringBuilder aiResponseBuilder = new StringBuilder();

    modelResponseStream
        .doOnNext(aiResponseBuilder::append)
        .doOnComplete(
            () -> {
              String fullAiResponse = aiResponseBuilder.toString();
              conversation.saveMessage(new MessageDescription("assistant", fullAiResponse));
            })
        .subscribe(
            text -> sendSseEvent(sseEventSink, sse, null, text),
            error -> {
              sendSseEvent(sseEventSink, sse, "error", error == null ? null : error.getMessage());
              sseEventSink.close();
            },
            () -> {
              sendSseEvent(sseEventSink, sse, "complete", "");
              sseEventSink.close();
            });
  }

  private void sendSseEvent(SseEventSink sseEventSink, Sse sse, String eventName, String data) {
    String payload = data == null ? "" : data;
    OutboundSseEvent.Builder builder = sse.newEventBuilder();
    if (eventName != null && !eventName.isBlank()) {
      builder.name(eventName);
    }
    OutboundSseEvent event = builder.data(String.class, payload).build();
    sseEventSink.send(event);
  }

  @Data
  @NoArgsConstructor
  public static class UpdateConversationRequest {
    @NotNull() private String title;
  }
}
