package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reengineering.ddd.teamai.description.AccountDescription;

public class AccountTest {
  private Account account;
  private AccountDescription description;

  @BeforeEach
  public void setUp() {
    description = new AccountDescription("github", "github-user-123");
    account = new Account("account-1", description);
  }

  @Test
  public void should_return_identity() {
    assertEquals("account-1", account.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(description, account.getDescription());
  }

  @Test
  public void should_return_provider_from_description() {
    assertEquals("github", account.getDescription().provider());
  }

  @Test
  public void should_return_provider_id_from_description() {
    assertEquals("github-user-123", account.getDescription().providerId());
  }

  @Test
  public void should_create_account_with_different_providers() {
    AccountDescription googleAccount = new AccountDescription("google", "google-456");
    Account account = new Account("account-2", googleAccount);

    assertEquals("google", account.getDescription().provider());
    assertEquals("google-456", account.getDescription().providerId());
  }
}
