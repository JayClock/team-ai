package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.cache.annotation.Cacheable;
import reengineering.ddd.teamai.api.representation.UserModel;
import reengineering.ddd.teamai.model.User;

public class UserApi {
  @Context
  ResourceContext resourceContext;

  private final User user;

  public UserApi(User user) {
    this.user = user;
  }

  @GET
  @Cacheable(value = "users", key = "#root.target.user.getIdentity()")
  public UserModel get(@Context UriInfo uriInfo) {
    return new UserModel(user, uriInfo);
  }

  @Path("accounts")
  public AccountsApi accounts() {
    return new AccountsApi(user);
  }

  @Path("conversations")
  public ConversationsApi conversations() {
    ConversationsApi conversationsApi = new ConversationsApi(user);
    return resourceContext.initResource(conversationsApi);
  }
}
