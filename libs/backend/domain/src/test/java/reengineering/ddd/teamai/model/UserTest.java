package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reengineering.ddd.archtype.HasMany;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;

@ExtendWith(MockitoExtension.class)
public class UserTest {
  @Mock private User.Accounts accounts;
  @Mock private User.Conversations conversations;

  private User user;
  private UserDescription userDescription;

  @BeforeEach
  public void setUp() {
    userDescription = new UserDescription("John Doe", "john@example.com");
    user = new User("user-1", userDescription, accounts, conversations, mock(User.Projects.class));
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
  public void should_return_conversations_association() {
    HasMany<String, Conversation> result = user.conversations();

    assertSame(conversations, result);
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
  public void should_delegate_add_conversation_to_conversations_association() {
    ConversationDescription conversationDescription =
        new ConversationDescription("Test Conversation");
    Conversation expectedConversation = mock(Conversation.class);
    when(conversations.add(conversationDescription)).thenReturn(expectedConversation);

    Conversation result = user.add(conversationDescription);

    assertSame(expectedConversation, result);
    verify(conversations).add(conversationDescription);
  }

  @Test
  public void should_delegate_delete_conversation_to_conversations_association() {
    String conversationId = "conversation-1";

    user.deleteConversation(conversationId);

    verify(conversations).delete(conversationId);
  }
}
