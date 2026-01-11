package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Message;

@Relation(collectionRelation = "messages")
public class MessageModel extends RepresentationModel<MessageModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private MessageDescription description;

  public MessageModel(Message message) {
    this.id = message.getIdentity();
    this.description = message.getDescription();
  }
}
