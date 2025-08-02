package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriBuilder;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.model.Account;

@Relation(collectionRelation = "accounts")
public class AccountModel extends RepresentationModel<AccountModel> {
  @JsonProperty
  private String id;
  @JsonUnwrapped
  private AccountDescription description;

  public AccountModel(Account account, UriBuilder builder) {
    this.id = account.getIdentity();
    this.description = account.getDescription();
    add(Link.of(builder.clone().build(account.getIdentity()).getPath(), "self"));
  }
}
