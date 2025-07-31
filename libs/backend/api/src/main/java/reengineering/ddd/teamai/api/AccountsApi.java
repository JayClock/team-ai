package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
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
  public CollectionModel<AccountModel> findAll() {
    List<AccountModel> accounts = user.accounts().findAll().stream().map(AccountModel::new).collect(Collectors.toList());
    return CollectionModel.of(accounts);
  }
}
