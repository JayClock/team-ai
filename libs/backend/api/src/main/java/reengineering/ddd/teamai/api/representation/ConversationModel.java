package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.HttpMethod;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.ConversationApi;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;

@Relation(collectionRelation = "conversations")
public class ConversationModel extends RepresentationModel<ConversationModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private ConversationDescription description;

  public ConversationModel(User user, Conversation conversation, UriInfo uriInfo) {
    this.id = conversation.getIdentity();
    this.description = conversation.getDescription();
    add(
        Link.of(
                ApiTemplates.conversation(uriInfo)
                    .build(user.getIdentity(), conversation.getIdentity())
                    .getPath(),
                "self")
            .withType(HttpMethod.GET));
    add(
        Link.of(
                ApiTemplates.messages(uriInfo)
                    .build(user.getIdentity(), conversation.getIdentity())
                    .getPath(),
                "messages")
            .withType(HttpMethod.GET));
    add(
        Link.of(
                ApiTemplates.conversation(uriInfo)
                    .path(ConversationApi.class, "chat")
                    .build(user.getIdentity(), conversation.getIdentity())
                    .getPath(),
                "send-message")
            .withType(HttpMethod.POST));
    add(
        Link.of(
                ApiTemplates.conversation(uriInfo)
                    .build(user.getIdentity(), conversation.getIdentity())
                    .getPath(),
                "delete")
            .withType(HttpMethod.DELETE));
  }
}
