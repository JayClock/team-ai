package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.archtype.HasOne;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.UserDescription;

@ExtendWith(MockitoExtension.class)
public class UserTest {
  @Mock private User.Accounts accounts;
  @Mock private HasOne<LocalCredential> credential;
  @Mock private User.Projects projects;

  private User user;
  private UserDescription userDescription;

  @BeforeEach
  public void setUp() {
    userDescription = new UserDescription("John Doe", "john@example.com");
    user = new User("user-1", userDescription, accounts, credential, projects);
  }

  @Test
  public void should_return_identity() {
    assertEquals("user-1", user.getIdentity());
  }

  @Test
  public void should_return_description() {
    assertEquals(userDescription, user.getDescription());
    assertEquals("John Doe", user.getDescription().name());
    assertEquals("john@example.com", user.getDescription().email());
  }

  @Test
  public void should_return_accounts_association() {
    HasMany<String, Account> result = user.accounts();

    assertSame(accounts, result);
  }

  @Test
  public void should_return_projects_association() {
    HasMany<String, Project> result = user.projects();

    assertSame(projects, result);
  }

  @Test
  public void should_delegate_add_account_to_accounts_association() {
    AccountDescription accountDescription = new AccountDescription("github", "github-123");
    Account expectedAccount = new Account("account-1", accountDescription);
    when(accounts.add(accountDescription)).thenReturn(expectedAccount);

    Account result = user.add(accountDescription);

    assertSame(expectedAccount, result);
    verify(accounts).add(accountDescription);
  }

  @Test
  public void should_return_empty_credential_when_not_bound() {
    when(credential.get()).thenReturn(null);

    assertTrue(user.credential().isEmpty());
  }
}
