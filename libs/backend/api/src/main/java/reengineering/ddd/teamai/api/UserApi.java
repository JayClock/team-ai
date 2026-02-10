package reengineering.ddd.teamai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.teamai.api.representation.UserModel;
import reengineering.ddd.teamai.description.UserDescription;
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
  @VendorMediaType(ResourceTypes.USER)
  public UserModel get(@Context UriInfo uriInfo) {
    return new UserModel(user, uriInfo);
  }

  @PUT
  @Consumes(MediaType.APPLICATION_JSON)
  public Response update(@Valid UpdateUserRequest change, @Context UriInfo uriInfo) {
    UserDescription description = new UserDescription(change.getName(), change.getEmail());
    users.update(user.getIdentity(), description);
    User updated = users.findByIdentity(user.getIdentity()).orElseThrow();
    return Response.ok(new UserModel(updated, uriInfo)).build();
  }

  @Path("accounts")
  public AccountsApi accounts() {
    AccountsApi accountsApi = new AccountsApi(user);
    return resourceContext.initResource(accountsApi);
  }

  @Data
  @NoArgsConstructor
  public static class UpdateUserRequest {
    @NotBlank
    @Size(max = 255)
    private String name;

    @NotBlank
    @Email
    @Size(max = 255)
    private String email;
  }
}
