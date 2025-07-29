package teamai.ddd.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import teamai.ddd.api.representation.UserModel;
import teamai.ddd.model.User;

public class UserApi {
  private final User user;

  public UserApi(User user) {
    this.user = user;
  }

  @GET
  public UserModel get(@Context UriInfo uriInfo) {
    return new UserModel(user, uriInfo);
  }
}
