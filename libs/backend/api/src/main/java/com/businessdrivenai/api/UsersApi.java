package com.businessdrivenai.api;

import com.businessdrivenai.domain.model.Users;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;

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
