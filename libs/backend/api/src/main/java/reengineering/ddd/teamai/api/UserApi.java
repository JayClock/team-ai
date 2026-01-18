package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.UserModel;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class UserApi {
  @Context ResourceContext resourceContext;

  private final User user;
  private final Users users;

  public UserApi(User user, Users users) {
    this.user = user;
    this.users = users;
  }

  @GET
  public UserModel get(@Context UriInfo uriInfo) {
    return new UserModel(user, uriInfo);
  }

  @PUT
  @Consumes(MediaType.APPLICATION_JSON)
  public Response update(@Valid User.UserChange change, @Context UriInfo uriInfo) {
    users.update(user.getIdentity(), change);
    User updated = users.findById(user.getIdentity()).orElseThrow();
    return Response.ok(new UserModel(updated, uriInfo)).build();
  }

  @Path("accounts")
  public AccountsApi accounts() {
    AccountsApi accountsApi = new AccountsApi(user);
    return resourceContext.initResource(accountsApi);
  }

  @Path("conversations")
  public ConversationsApi conversations() {
    ConversationsApi conversationsApi = new ConversationsApi(user);
    return resourceContext.initResource(conversationsApi);
  }

  @Path("projects")
  public ProjectsApi projects() {
    ProjectsApi projectsApi = new ProjectsApi(user);
    return resourceContext.initResource(projectsApi);
  }
}
