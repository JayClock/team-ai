package reengineering.ddd.teamai.api;

import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.MessageModel;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;

public class MessagesApi {
  private final User user;
  private final Conversation conversation;

  public MessagesApi(User user, Conversation conversation) {
    this.user = user;
    this.conversation = conversation;
  }

  @GET
  public CollectionModel<MessageModel> findAll(@Context UriInfo uriInfo,
                                               @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(conversation.messages().findAll(), 40).page(page,
      MessageModel::new,
      p -> uriInfo.getAbsolutePathBuilder().queryParam("page", p).build(conversation.getIdentity()));
  }
}
