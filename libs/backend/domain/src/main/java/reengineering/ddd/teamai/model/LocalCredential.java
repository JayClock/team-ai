package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.teamai.description.LocalCredentialDescription;

public class LocalCredential implements Entity<String, LocalCredentialDescription> {
  private String identity;
  private LocalCredentialDescription description;

  public LocalCredential(String identity, LocalCredentialDescription description) {
    this.identity = identity;
    this.description = description;
  }

  private LocalCredential() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public LocalCredentialDescription getDescription() {
    return description;
  }
}
