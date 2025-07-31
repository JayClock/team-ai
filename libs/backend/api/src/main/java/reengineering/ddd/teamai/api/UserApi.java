package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.UserModel;
import reengineering.ddd.teamai.model.User;

public class UserApi {
  private final User user;

  public UserApi(User user) {
    this.user = user;
  }

  @GET
  public UserModel get(@Context UriInfo uriInfo) {
    return new UserModel(user, uriInfo);
  }

  @Path("accounts")
  public UserAccountsApi accounts() {
    return new UserAccountsApi(user);
  }
}
