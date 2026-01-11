package reengineering.ddd.teamai.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import reengineering.ddd.teamai.model.Users;

@Path("/users")
public class UsersApi {

  private final Users users;

  @Context private ResourceContext resourceContext;

  @Inject
  public UsersApi(Users users) {
    this.users = users;
  }

  @Path("{id}")
  public UserApi findById(@PathParam("id") String id) {
    return users
        .findById(id)
        .map(
            (user) -> {
              UserApi userApi = new UserApi(user);
              return resourceContext.initResource(userApi);
            })
        .orElse(null);
  }
}
