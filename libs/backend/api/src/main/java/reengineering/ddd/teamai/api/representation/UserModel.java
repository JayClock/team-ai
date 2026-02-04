package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.http.HttpMethod;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;

public class UserModel extends RepresentationModel<UserModel> {
  @JsonProperty public String id;

  @JsonUnwrapped private UserDescription description;

  @JsonProperty("_embedded")
  private EmbeddedResources embedded;

  public UserModel(User user, UriInfo uriInfo) {
    this.id = user.getIdentity();
    this.description = user.getDescription();

    add(
        Affordances.of(
                Link.of(ApiTemplates.user(uriInfo).build(user.getIdentity()).getPath())
                    .withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(User.UserChange.class)
            .withName("update-user")
            .toLink());

    add(
        Link.of(ApiTemplates.accounts(uriInfo).build(user.getIdentity()).getPath())
            .withRel("accounts"));

    this.embedded =
        new EmbeddedResources(
            user.accounts().findAll().stream()
                .map(account -> new AccountModel(user, account, uriInfo))
                .toList());
  }

  public record EmbeddedResources(@JsonProperty("accounts") List<AccountModel> accounts) {}
}
