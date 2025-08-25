package reengineering.ddd.teamai.api;

import java.util.UUID;

import org.springframework.web.bind.annotation.RequestParam;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.model.Conversation;

public class ConversationApi {
  @Context
  private ResourceContext resourceContext;

  private final Conversation conversation;

  public ConversationApi(Conversation conversation) {
    this.conversation = conversation;
  }

  @GET
  public ConversationModel get(@Context UriInfo uriInfo) {
    return new ConversationModel(conversation, uriInfo.getAbsolutePathBuilder());
  }

  @Path("messages")
  public MessagesApi messages() {
    MessagesApi messagesApi = new MessagesApi(conversation);
    return resourceContext.initResource(messagesApi);
  }

  @Path("chat")
  @GET
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void sendMessage(
      @RequestParam("message") String message,
      @Context SseEventSink sseEventSink,
      @Context Sse sse) {
    this.conversation.sendMessage(message).subscribe(
        text -> {
          OutboundSseEvent event = sse.newEventBuilder()
              .id(UUID.randomUUID().toString())
              .name("message")
              .data(text)
              .build();
          sseEventSink.send(event);
        });
  }
}
