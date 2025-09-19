package reengineering.ddd.teamai.api;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.ConversationModel;
import reengineering.ddd.teamai.api.representation.MessageModel;
import reengineering.ddd.teamai.description.EpicDescription;
import reengineering.ddd.teamai.description.MessageDescription;
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

  @GET
  @Path("messages")
  public CollectionModel<MessageModel> findAll(@Context UriInfo uriInfo,
                                               @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(conversation.messages().findAll(), 40).page(page,
      MessageModel::new,
      p -> uriInfo.getAbsolutePathBuilder().queryParam("page", p).build(conversation.getIdentity()));
  }

  @POST
  @Path("messages")
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void chat(
    MessageDescription description,
    @Context SseEventSink sseEventSink,
    @Context Sse sse) {
    this.conversation.sendMessage(description).subscribe(
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
