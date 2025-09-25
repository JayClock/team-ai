package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.UserApi;
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
    add(Link.of(ApiTemplates.user(uriInfo).build(user.getIdentity()).getPath(), "self"));
    add(Link.of(ApiTemplates.accounts(uriInfo).build(user.getIdentity()).getPath(), "accounts"));
    add(Link.of(ApiTemplates.conversations(uriInfo).build(user.getIdentity()).getPath(), "conversations"));
    add(Affordances.of(
        Link.of(ApiTemplates.conversations(uriInfo).build(user.getIdentity()).getPath(), "create-conversation").withType(HttpMethod.POST.toString()))
      .afford(HttpMethod.POST)
      .withInput(ConversationDescription.class)
      .toLink());
  }
}
