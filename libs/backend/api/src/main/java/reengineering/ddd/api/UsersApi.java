package reengineering.ddd.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import reengineering.ddd.model.Users;

@Path("/users")
public class UsersApi {
  private final Users users;

  @Inject
  public UsersApi(Users users) {
    this.users = users;
  }

  @Path("{id}")
  public UserApi findById(@PathParam("id") String id) {
    return users.findById(id).map(UserApi::new).orElse(null);
  }
}
