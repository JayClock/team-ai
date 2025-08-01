package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriBuilder;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import reengineering.ddd.teamai.api.UserApi;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;

public class UserModel extends RepresentationModel<UserModel> {
  @JsonProperty
  public String id;

  @JsonUnwrapped
  private UserDescription description;

  public UserModel(User user, UriBuilder builder) {
    this.id = user.getIdentity();
    this.description = user.getDescription();
    add(Link.of(builder.clone().build(user.getIdentity()).getPath(), "self"));
    add(Link.of(builder.clone().path(UserApi.class,"accounts").build(user.getIdentity()).getPath(), "accounts"));
    add(Link.of(builder.clone().path(UserApi.class,"conversations").build(user.getIdentity()).getPath(), "conversations"));
  }
}
