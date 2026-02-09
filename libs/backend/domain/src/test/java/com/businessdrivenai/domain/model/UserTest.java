package com.businessdrivenai.domain.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.businessdrivenai.archtype.HasMany;
import com.businessdrivenai.domain.description.AccountDescription;
import com.businessdrivenai.domain.description.UserDescription;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
public class UserTest {
  @Mock private User.Accounts accounts;
  @Mock private User.Projects projects;

  private User user;
  private UserDescription userDescription;

  @BeforeEach
  public void setUp() {
    userDescription = new UserDescription("John Doe", "john@example.com");
    user = new User("user-1", userDescription, accounts, projects);
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
}
