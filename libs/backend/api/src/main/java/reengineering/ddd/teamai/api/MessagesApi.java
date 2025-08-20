package reengineering.ddd.teamai.api;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
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
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(MessageDescription description, @Context UriInfo uriInfo) {
    Message message = this.conversation.add(description);
    return Response.created(uriInfo.getAbsolutePathBuilder().path(message.getIdentity()).build()).build();
  }

  @GET
  public CollectionModel<MessageModel> findAll(@Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(conversation.messages().findAll(), 40).
      page(page,
        MessageModel::new,
        p -> uriInfo.getAbsolutePathBuilder().queryParam("page", p).build(conversation.getIdentity())
      );
  }
}
