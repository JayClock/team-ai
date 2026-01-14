package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.User;

@Relation(collectionRelation = "messages")
public class MessageModel extends RepresentationModel<MessageModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private MessageDescription description;

  public MessageModel(User user, Conversation conversation, Message message, UriInfo uriInfo) {
    this.id = message.getIdentity();
    this.description = message.getDescription();
    add(
        Link.of(
            ApiTemplates.message(uriInfo)
                .build(user.getIdentity(), conversation.getIdentity(), message.getIdentity())
                .getPath(),
            "self"));
  }
}
