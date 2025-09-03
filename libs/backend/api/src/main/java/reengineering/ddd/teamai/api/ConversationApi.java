package reengineering.ddd.teamai.api;

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
import reengineering.ddd.teamai.description.EpicDescription;
import reengineering.ddd.teamai.model.Conversation;

public class ConversationApi {
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
    return new MessagesApi(conversation);
  }

  @Path("chat-to-breakdown-epic")
  @POST
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void chatToBreakdownEpic(
    EpicDescription description,
    @Context SseEventSink sseEventSink,
    @Context Sse sse
  ) {
    this.conversation.epicBreakdown(description).subscribe(
      text -> {
        OutboundSseEvent event = sse.newEventBuilder()
          .data(text)
          .build();

        sseEventSink.send(event);
      },
      error -> {
        sseEventSink.close();
      },
      sseEventSink::close);
  }
}
