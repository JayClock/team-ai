package reengineering.ddd.teamai.api;

import jakarta.ws.rs.POST;
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
  public MessageModel create(MessageDescription description) {
    Message message = this.conversation.add(description);
    return new MessageModel(message);
  }
}
