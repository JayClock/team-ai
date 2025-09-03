package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.UserModel;
import reengineering.ddd.teamai.model.User;

public class UserApi {
  private final User user;
  @Context
  private ResourceContext resourceContext;

  public UserApi(User user) {
    this.user = user;
  }

  @GET
  public UserModel get(@Context UriInfo uriInfo) {
    UriBuilder uriBuilder = uriInfo.getAbsolutePathBuilder();
    return new UserModel(user, uriBuilder);
  }

  @Path("accounts")
  public AccountsApi accounts() {
    return new AccountsApi(user);
  }

  @Path("conversations")
  public ConversationsApi conversations() {
    return new ConversationsApi(user);
  }
}
