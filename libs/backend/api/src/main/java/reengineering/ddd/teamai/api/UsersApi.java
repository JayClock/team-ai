package reengineering.ddd.teamai.api;

import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import reengineering.ddd.teamai.model.Users;

public class UsersApi {

  private final Users users;

  @Context private ResourceContext resourceContext;

  public UsersApi(Users users) {
    this.users = users;
  }

  @Path("{id}")
  public UserApi findById(@PathParam("id") String id) {
    return users
        .findByIdentity(id)
        .map(
            (user) -> {
              UserApi userApi = new UserApi(user, users);
              return resourceContext.initResource(userApi);
            })
        .orElse(null);
  }
}
