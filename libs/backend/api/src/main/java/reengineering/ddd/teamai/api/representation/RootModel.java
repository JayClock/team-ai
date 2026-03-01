package reengineering.ddd.teamai.api.representation;

import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.api.RootApi;

public class RootModel extends RepresentationModel<RootModel> {

  private RootModel() {}

  public static RootModel anonymous(UriInfo uriInfo) {
    RootModel model = new RootModel();

    model.add(Link.of(uriInfo.getRequestUri().getPath()).withSelfRel());
    URI localLoginUri =
        uriInfo.getBaseUriBuilder().path(RootApi.class).path(RootApi.class, "login").build();
    model.add(Link.of(localLoginUri.getPath(), "login"));
    URI localRegisterUri =
        uriInfo.getBaseUriBuilder().path(RootApi.class).path(RootApi.class, "register").build();
    model.add(Link.of(localRegisterUri.getPath(), "register"));
    model.add(Link.of("/oauth2/authorization/github", "login-oauth-github"));

    return model;
  }

  public static RootModel authenticated(String userId, UriInfo uriInfo) {
    RootModel model = new RootModel();

    model.add(Link.of(uriInfo.getRequestUri().getPath()).withSelfRel());

    URI userUri = ApiTemplates.user(uriInfo).build(userId);

    model.add(Link.of(userUri.getPath(), "me"));
    model.add(Link.of("/logout", "logout"));

    return model;
  }
}
