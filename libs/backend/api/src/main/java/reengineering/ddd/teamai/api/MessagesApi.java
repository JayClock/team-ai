package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
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
  public CollectionModel<MessageModel> findAll() {
    var messages = conversation.messages().findAll().stream().map(MessageModel::new).toList();
    return CollectionModel.of(messages);
  }
}
