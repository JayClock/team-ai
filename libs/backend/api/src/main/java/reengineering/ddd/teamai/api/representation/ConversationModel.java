package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;

@Relation(collectionRelation = "conversations")
public class ConversationModel extends RepresentationModel<ConversationModel> {
  @JsonProperty
  private String id;
  @JsonUnwrapped
  private ConversationDescription description;

  public ConversationModel(Conversation conversation) {
    this.id = conversation.getIdentity();
    this.description = conversation.getDescription();
  }
}
