package reengineering.ddd.teamai.model;

import java.util.Optional;
import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.archtype.HasOne;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.UserDescription;

public class User implements Entity<String, UserDescription> {
  private String identity;
  private UserDescription description;
  private Accounts accounts;
  private HasOne<LocalCredential> credential;
  private Projects projects;

  public User(
      String identity,
      UserDescription description,
      Accounts accounts,
      HasOne<LocalCredential> credential,
      Projects projects) {
    this.identity = identity;
    this.description = description;
    this.accounts = accounts;
    this.credential = credential;
    this.projects = projects;
  }

  private User() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public UserDescription getDescription() {
    return description;
  }

  public Account add(AccountDescription description) {
    return accounts.add(description);
  }

  public HasMany<String, Account> accounts() {
    return accounts;
  }

  public HasMany<String, Project> projects() {
    return projects;
  }

  public Optional<LocalCredential> credential() {
    return Optional.ofNullable(credential).map(HasOne::get);
  }

  public Project add(ProjectDescription projectDescription) {
    return projects.add(projectDescription);
  }

  public interface Accounts extends HasMany<String, Account> {
    Account add(AccountDescription description);
  }

  public interface Projects extends HasMany<String, Project> {
    Project add(ProjectDescription description);
  }
}
