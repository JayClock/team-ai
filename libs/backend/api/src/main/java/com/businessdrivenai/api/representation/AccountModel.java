package com.businessdrivenai.api.representation;

import com.businessdrivenai.api.ApiTemplates;
import com.businessdrivenai.domain.description.AccountDescription;
import com.businessdrivenai.domain.model.Account;
import com.businessdrivenai.domain.model.User;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.server.core.Relation;

@Relation(collectionRelation = "accounts")
public class AccountModel extends RepresentationModel<AccountModel> {
  @JsonProperty private String id;
  @JsonUnwrapped private AccountDescription description;

  public AccountModel(User user, Account account, UriInfo uriInfo) {
    this.id = account.getIdentity();
    this.description = account.getDescription();
    add(
        Link.of(
                ApiTemplates.account(uriInfo)
                    .build(user.getIdentity(), account.getIdentity())
                    .getPath())
            .withSelfRel());
  }
}
