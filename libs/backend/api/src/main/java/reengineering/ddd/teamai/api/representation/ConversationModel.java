package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.HttpMethod;
import jakarta.ws.rs.core.UriBuilder;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.api.ConversationApi;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;

@Relation(collectionRelation = "conversations")
public class ConversationModel extends RepresentationModel<ConversationModel> {
  @JsonProperty
  private String id;
  @JsonUnwrapped
  private ConversationDescription description;

  public ConversationModel(Conversation conversation, UriBuilder builder) {
    this.id = conversation.getIdentity();
    this.description = conversation.getDescription();
    add(Link.of(builder.clone().build(conversation.getIdentity()).getPath(), "self").withType(HttpMethod.GET));
    add(Link.of(builder.clone().path(ConversationApi.class, "messages").build(conversation.getIdentity()).getPath(), "messages").withType(HttpMethod.GET));
    add(Link.of(builder.clone().path(ConversationApi.class, "messages").build(conversation.getIdentity()).getPath(), "save-message").withType(HttpMethod.POST));
  }
}
