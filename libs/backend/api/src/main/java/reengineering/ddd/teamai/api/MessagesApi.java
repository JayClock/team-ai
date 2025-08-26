package reengineering.ddd.teamai.api;

import org.springframework.hateoas.CollectionModel;

import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import reengineering.ddd.teamai.api.representation.MessageModel;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;

public class MessagesApi {

  private final Conversation conversation;

  public MessagesApi(Conversation conversation) {
    this.conversation = conversation;
  }

  @POST
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void sendMessage(
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

  @GET
  public CollectionModel<MessageModel> findAll(@Context UriInfo uriInfo,
      @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(conversation.messages().findAll(), 40).page(page,
        MessageModel::new,
        p -> uriInfo.getAbsolutePathBuilder().queryParam("page", p).build(conversation.getIdentity()));
  }
}
