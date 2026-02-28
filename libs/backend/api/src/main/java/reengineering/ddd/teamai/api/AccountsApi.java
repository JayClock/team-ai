package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.AccountModel;
import reengineering.ddd.teamai.model.User;

public class AccountsApi {
  private final User user;

  public AccountsApi(User user) {
    this.user = user;
  }

  @GET
  @VendorMediaType(ResourceTypes.ACCOUNT_COLLECTION)
  public CollectionModel<AccountModel> findAll(@Context UriInfo uriInfo) {
    List<AccountModel> accounts =
        user.accounts().findAll().stream()
            .map(account -> new AccountModel(user, account, uriInfo))
            .collect(Collectors.toList());
    return CollectionModel.of(accounts);
  }

  @GET
  @Path("{account-id}")
  @VendorMediaType(ResourceTypes.ACCOUNT)
  public AccountModel findById(@PathParam("account-id") String id, @Context UriInfo uriInfo) {
    return user.accounts()
        .findByIdentity(id)
        .map(account -> new AccountModel(user, account, uriInfo))
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }
}
