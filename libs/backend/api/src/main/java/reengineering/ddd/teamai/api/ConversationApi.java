package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import java.util.UUID;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

public class ConversationApi {
  @Inject private Conversation.ModelProvider modelProvider;

  private final User user;
  private final Project project;
  private final Conversation conversation;

  public ConversationApi(User user, Project project, Conversation conversation) {
    this.user = user;
    this.project = project;
    this.conversation = conversation;
  }

  @GET
  public ConversationModel get(@Context UriInfo uriInfo) {
    return new ConversationModel(user, project, conversation, uriInfo);
  }

  @DELETE
  public Response delete() {
    project.deleteConversation(conversation.getIdentity());
    return Response.noContent().build();
  }

  @Path("messages")
  public MessagesApi messages() {
    return new MessagesApi(user, project, conversation);
  }

  private static final String API_KEY_HEADER = "X-Api-Key";

  @POST
  @Path("messages/stream")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void chat(
      MessageDescription description,
      @Context SseEventSink sseEventSink,
      @Context Sse sse,
      @Context HttpHeaders headers) {
    String apiKey = headers.getHeaderString(API_KEY_HEADER);
    if (apiKey == null || apiKey.isEmpty()) {
      throw new WebApplicationException("Missing API Key", Response.Status.UNAUTHORIZED);
    }

    StringBuilder aiResponseBuilder = new StringBuilder();
    String messageId = UUID.randomUUID().toString();
    String textId = UUID.randomUUID().toString();

    // Send Vercel AI SDK Data Stream Protocol events
    // 1. Message start
    sendSseEvent(sseEventSink, sse, "{\"type\":\"start\",\"messageId\":\"" + messageId + "\"}");
    // 2. Text start
    sendSseEvent(sseEventSink, sse, "{\"type\":\"text-start\",\"id\":\"" + textId + "\"}");

    this.conversation
        .sendMessage(description, modelProvider, apiKey)
        .doOnNext(aiResponseBuilder::append)
        .doOnComplete(
            () -> {
              String fullAiResponse = aiResponseBuilder.toString();
              conversation.saveMessage(new MessageDescription("assistant", fullAiResponse));
            })
        .subscribe(
            text -> {
              // 3. Text delta - escape JSON string properly
              String escapedText = escapeJsonString(text);
              sendSseEvent(
                  sseEventSink,
                  sse,
                  "{\"type\":\"text-delta\",\"id\":\""
                      + textId
                      + "\",\"delta\":\""
                      + escapedText
                      + "\"}");
            },
            error -> {
              // Send error event
              String errorMessage = escapeJsonString(error.getMessage());
              sendSseEvent(
                  sseEventSink, sse, "{\"type\":\"error\",\"errorText\":\"" + errorMessage + "\"}");
              sendSseEvent(sseEventSink, sse, "[DONE]");
              sseEventSink.close();
            },
            () -> {
              // 4. Text end
              sendSseEvent(sseEventSink, sse, "{\"type\":\"text-end\",\"id\":\"" + textId + "\"}");
              // 5. Finish message
              sendSseEvent(sseEventSink, sse, "{\"type\":\"finish\"}");
              // 6. Stream termination
              sendSseEvent(sseEventSink, sse, "[DONE]");
              sseEventSink.close();
            });
  }

  private void sendSseEvent(SseEventSink sseEventSink, Sse sse, String data) {
    OutboundSseEvent event = sse.newEventBuilder().data(data).build();
    sseEventSink.send(event);
  }

  private String escapeJsonString(String input) {
    if (input == null) {
      return "";
    }
    return input
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t");
  }
}
