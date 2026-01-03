package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;

public class ConversationApi {
  @Inject
  private Conversation.ModelProvider modelProvider;

  private final User user;
  private final Conversation conversation;

  public ConversationApi(User user, Conversation conversation) {
    this.user = user;
    this.conversation = conversation;
  }

  @GET
  public ConversationModel get(@Context UriInfo uriInfo) {
    return new ConversationModel(user, conversation, uriInfo);
  }

  @Path("messages")
  public MessagesApi messages() {
    return new MessagesApi(user, conversation);
  }

  @POST
  @Path("messages:chat")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void chat(
    MessageDescription description,
    @Context SseEventSink sseEventSink,
    @Context Sse sse) {
    this.conversation.sendMessage(description, modelProvider).subscribe(
      text -> {
        OutboundSseEvent event = sse.newEventBuilder()
          .data(text)
          .build();

        sseEventSink.send(event);
      },
      error -> {
        sseEventSink.close();
      },
      () -> {
        sseEventSink.close();
      });
  }
}
