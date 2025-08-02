package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.AccountModel;
import reengineering.ddd.teamai.model.User;

import java.util.List;
import java.util.stream.Collectors;

public class AccountsApi {
  private final User user;

  public AccountsApi(User user) {
    this.user = user;
  }

  @GET
  public CollectionModel<AccountModel> findAll(@Context UriInfo uriInfo) {
    List<AccountModel> accounts = user.accounts().findAll().stream().map(account -> new AccountModel(user, account, uriInfo)).collect(Collectors.toList());
    return CollectionModel.of(accounts);
  }

  @GET
  @Path("{account-id}")
  public AccountModel findById(@PathParam("account-id") String id, @Context UriInfo uriInfo) {
    return user.accounts().findByIdentity(id).map(account -> new AccountModel(user, account, uriInfo))
      .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }
}
