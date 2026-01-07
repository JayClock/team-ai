package reengineering.ddd.teamai.api.representation;

import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import reengineering.ddd.teamai.api.UsersApi;

import jakarta.ws.rs.core.UriInfo;
import java.net.URI;

public class RootModel extends RepresentationModel<RootModel> {

  private RootModel() {}

  public static RootModel anonymous(UriInfo uriInfo) {
    RootModel model = new RootModel();

    model.add(Link.of(uriInfo.getRequestUri().getPath()).withSelfRel());
    model.add(Link.of("/oauth2/authorization/github", "login"));

    return model;
  }

  public static RootModel authenticated(String userId, UriInfo uriInfo) {
    RootModel model = new RootModel();

    model.add(Link.of(uriInfo.getRequestUri().getPath()).withSelfRel());

    URI userUri = uriInfo.getBaseUriBuilder()
      .path(UsersApi.class)
      .path(UsersApi.class, "findById")
      .build(userId);

    model.add(Link.of(userUri.getPath(), "me"));
    model.add(Link.of("/logout", "logout"));

    return model;
  }
}
