package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
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
  public CollectionModel<MessageModel> findAll(@Context UriInfo uriInfo) {
    var messages =
        conversation.messages().findAll().stream()
            .map(message -> new MessageModel(user, conversation, message, uriInfo))
            .toList();
    return CollectionModel.of(messages);
  }
}
