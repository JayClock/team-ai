package reengineering.ddd.teamai.api;

import org.springframework.hateoas.CollectionModel;

import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.MessageModel;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;

public class MessagesApi {

  private final Conversation conversation;

  public MessagesApi(Conversation conversation) {
    this.conversation = conversation;
  }

  @POST
  public Response saveMessage(MessageDescription description, @Context UriInfo uriInfo) {
    Message message = conversation.saveMessage(description);
    return Response.created(
        uriInfo.getAbsolutePathBuilder().path(message.getIdentity()).build())
        .build();
  }

  @GET
  public CollectionModel<MessageModel> findAll(@Context UriInfo uriInfo,
      @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(conversation.messages().findAll(), 40).page(page,
        MessageModel::new,
        p -> uriInfo.getAbsolutePathBuilder().queryParam("page", p).build(conversation.getIdentity()));
  }
}
