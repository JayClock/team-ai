package com.businessdrivenai.api;

import com.businessdrivenai.api.representation.UserModel;
import com.businessdrivenai.domain.model.User;
import com.businessdrivenai.domain.model.Users;
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
  public Response update(@Valid User.UserChange change, @Context UriInfo uriInfo) {
    users.update(user.getIdentity(), change);
    User updated = users.findByIdentity(user.getIdentity()).orElseThrow();
    return Response.ok(new UserModel(updated, uriInfo)).build();
  }

  @Path("accounts")
  public AccountsApi accounts() {
    AccountsApi accountsApi = new AccountsApi(user);
    return resourceContext.initResource(accountsApi);
  }
}
