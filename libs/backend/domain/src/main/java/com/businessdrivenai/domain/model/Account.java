package com.businessdrivenai.domain.model;

import com.businessdrivenai.archtype.Entity;
import com.businessdrivenai.domain.description.AccountDescription;

public class Account implements Entity<String, AccountDescription> {
  private String identity;
  private AccountDescription description;

  public Account(String identity, AccountDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private Account() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public AccountDescription getDescription() {
    return description;
  }
}
