package teamai.ddd.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import teamai.ddd.api.ApiTemplates;
import teamai.ddd.description.UserDescription;
import teamai.ddd.model.User;

public class UserModel extends RepresentationModel<UserModel> {
  @JsonProperty
  public String id;

  @JsonUnwrapped
  private UserDescription description;

  public UserModel(User user, UriInfo uriInfo) {
    this.id = user.getIdentity();
    this.description = user.getDescription();
    add(Link.of(ApiTemplates.user(uriInfo).build(user.getIdentity()).getPath(), "self"));
  }
}
