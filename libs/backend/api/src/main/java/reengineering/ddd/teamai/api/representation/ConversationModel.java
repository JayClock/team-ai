package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.ConversationApi;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;

@Relation(collectionRelation = "conversations")
public class ConversationModel extends RepresentationModel<ConversationModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private ConversationDescription description;

  public ConversationModel(User user, Conversation conversation, UriInfo uriInfo) {
    this.id = conversation.getIdentity();
    this.description = conversation.getDescription();

    Link selfLink =
        Link.of(
                ApiTemplates.conversation(uriInfo)
                    .build(user.getIdentity(), conversation.getIdentity())
                    .getPath())
            .withSelfRel();

    Link messagesLink =
        Link.of(
                ApiTemplates.messages(uriInfo)
                    .build(user.getIdentity(), conversation.getIdentity())
                    .getPath())
            .withRel("messages");

    Link chatLink =
        Link.of(
                ApiTemplates.conversation(uriInfo)
                    .path(ConversationApi.class, "chat")
                    .build(user.getIdentity(), conversation.getIdentity())
                    .getPath())
            .withRel("chat");

    add(
        Affordances.of(selfLink)
            .afford(HttpMethod.PUT)
            .withInput(Conversation.ConversationChange.class)
            .andAfford(HttpMethod.DELETE)
            .withName("delete-conversation")
            .toLink());
    add(
        Affordances.of(chatLink)
            .afford(HttpMethod.POST)
            .withInput(MessageDescription.class)
            .withName("chat")
            .toLink());

    add(messagesLink);
  }
}
