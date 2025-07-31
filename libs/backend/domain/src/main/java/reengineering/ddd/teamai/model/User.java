package reengineering.ddd.teamai.model;

import reengineering.ddd.archtype.Entity;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;

public class User implements Entity<String, UserDescription> {
  private String identity;
  private UserDescription description;
  private Accounts accounts;
  private Conversations conversations;

  public User(String identity, UserDescription description, Accounts accounts, Conversations conversations) {
    this.identity = identity;
    this.description = description;
    this.accounts = accounts;
    this.conversations = conversations;
  }

  private User() {
  }

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

  public Conversation add(ConversationDescription conversation) {
    return conversations.add(conversation);
  }

  public HasMany<String, Account> accounts() {
    return accounts;
  }

  public HasMany<String, Conversation> conversations() {
    return conversations;
  }

  public interface Accounts extends HasMany<String, Account> {
    Account add(AccountDescription description);
  }

  public interface Conversations extends HasMany<String, Conversation> {
    Conversation add(ConversationDescription description);
  }
}
