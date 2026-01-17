package reengineering.ddd.teamai.api.representation;

import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;

import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.ApiTemplates;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.User;

@Relation(collectionRelation = "accounts")
public class AccountModel extends RepresentationModel<AccountModel> {
  @JsonProperty
  private String id;
  @JsonUnwrapped
  private AccountDescription description;

  public AccountModel(User user, Account account, UriInfo uriInfo) {
    this.id = account.getIdentity();
    this.description = account.getDescription();
    Link selfLink = Link.of(
        ApiTemplates.account(uriInfo)
            .build(user.getIdentity(), account.getIdentity())
            .getPath())
        .withSelfRel();
    add(selfLink);
  }
}
