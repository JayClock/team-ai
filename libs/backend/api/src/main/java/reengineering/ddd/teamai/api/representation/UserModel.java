package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;

public class UserModel extends RepresentationModel<UserModel> {
  @JsonProperty
  public String id;

  @JsonUnwrapped
  private UserDescription description;

  public UserModel(User user, UriInfo uriInfo) {
    this.id = user.getIdentity();
    this.description = user.getDescription();

    Link selfRel = Link.of(ApiTemplates.user(uriInfo).build(user.getIdentity()).getPath()).withSelfRel();
    add(Affordances.of(selfRel)
      .afford(HttpMethod.PUT)
      .withInput(UserDescription.class)
      .withName("update-user")
      .toLink());

    add(Link.of(ApiTemplates.accounts(uriInfo).build(user.getIdentity()).getPath()).withRel("accounts"));
    add(Link.of(ApiTemplates.conversations(uriInfo).build(user.getIdentity()).getPath()).withRel("conversations"));

    Link conversationsRel = Link.of(ApiTemplates.conversations(uriInfo).build(user.getIdentity()).getPath()).withRel("create-conversation");
    add(Affordances.of(conversationsRel)
      .afford(HttpMethod.POST)
      .withInput(ConversationDescription.class)
      .withName("create-conversation")
      .toLink());
  }
}
