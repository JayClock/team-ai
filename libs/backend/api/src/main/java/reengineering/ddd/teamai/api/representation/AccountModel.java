package reengineering.ddd.teamai.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
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

  public AccountModel(Account account) {
    this.id = account.getIdentity();
    this.description = account.getDescription();
  }
}
