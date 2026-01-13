package reengineering.ddd;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;

@MybatisTest
@Import({TestContainerConfig.class, FlywayConfig.class})
@ExtendWith(TestDataSetup.class)
public class AssociationsTest {
  @Inject private Users users;

  private User user;

  String userId = "1";

  @BeforeEach
  public void setup() {
    user = users.findById(userId).get();
  }

  @Nested
  class UsersTest {
    @Test
    public void should_find_user_by_id() {
      assertEquals(String.valueOf(userId), user.getIdentity());
      assertEquals("John Smith", user.getDescription().name());
      assertEquals("john.smith@email.com", user.getDescription().email());

      User cachedUser = users.findById(String.valueOf(userId)).get();
      assertEquals(user.getIdentity(), cachedUser.getIdentity());
      assertEquals(user.getDescription().name(), cachedUser.getDescription().name());
      assertEquals(user.getDescription().email(), cachedUser.getDescription().email());
      assertSame(user, cachedUser, "User should be cached and return same instance");
    }

    @Test
    public void should_not_find_user_if_not_exist() {
      assertTrue(users.findById("-1").isEmpty());
    }

    @Nested
    class UserConversationsTest {
      @Test
      public void should_get_conversations_association_of_user() {
        int conversationCount = 100;
        assertEquals(conversationCount, user.conversations().findAll().size());

        var firstResult = user.conversations().findAll();
        var secondResult = user.conversations().findAll();
        assertEquals(firstResult.size(), secondResult.size());
        assertEquals(conversationCount, secondResult.size());
      }

      @Test
      public void should_sub_conversations_association_of_user() {
        assertEquals(10, user.conversations().findAll().subCollection(10, 20).size());
      }

      @Test
      public void should_find_single_conversation_by_of_user() {
        String identity = user.conversations().findAll().iterator().next().getIdentity();
        Conversation conversation = user.conversations().findByIdentity(identity).get();
        assertEquals(identity, conversation.getIdentity());

        Conversation cachedConversation = user.conversations().findByIdentity(identity).get();
        assertEquals(conversation.getIdentity(), cachedConversation.getIdentity());
        assertEquals(
            conversation.getDescription().title(), cachedConversation.getDescription().title());
      }

      @Test
      public void should_not_find_conversation_of_user_if_not_exist() {
        assertTrue(user.conversations().findByIdentity("-1").isEmpty());
      }

      @Test
      public void should_delete_conversation_of_user() {
        // Get the first conversation
        String identity = user.conversations().findAll().iterator().next().getIdentity();
        int initialCount = user.conversations().findAll().size();

        // Verify it exists before deletion
        assertTrue(user.conversations().findByIdentity(identity).isPresent());

        // Delete the conversation
        user.deleteConversation(identity);

        // Verify it no longer exists - need to get fresh user to avoid cache
        User freshUser = users.findById(userId).get();
        assertTrue(freshUser.conversations().findByIdentity(identity).isEmpty());
        assertEquals(initialCount - 1, freshUser.conversations().findAll().size());
      }

      @Nested
      class ConversationMessagesTest {
        int messageCount = 100;
        Conversation conversation;

        @BeforeEach
        public void setupConversation() {
          conversation = user.conversations().findAll().stream().findFirst().get();
        }

        @Test
        public void should_get_messages_association_of_conversation() {
          assertEquals(messageCount, conversation.messages().findAll().size());

          var firstResult = conversation.messages().findAll();
          var secondResult = conversation.messages().findAll();
          assertEquals(firstResult.size(), secondResult.size());
          assertEquals(messageCount, secondResult.size());
        }

        @Test
        public void should_sub_messages_association_of_conversation() {
          assertEquals(40, conversation.messages().findAll().subCollection(0, 40).size());

          var firstResult = conversation.messages().findAll().subCollection(0, 40);
          var secondResult = conversation.messages().findAll().subCollection(0, 40);
          assertEquals(firstResult.size(), secondResult.size());
          assertEquals(40, secondResult.size());
        }

        @Test
        public void should_find_single_message_of_conversation() {
          String identity = conversation.messages().findAll().iterator().next().getIdentity();
          Message message = conversation.messages().findByIdentity(identity).get();
          assertEquals(identity, message.getIdentity());

          var cachedMessage = conversation.messages().findByIdentity(identity).get();
          assertEquals(message.getIdentity(), cachedMessage.getIdentity());
          assertEquals(message.getDescription().role(), cachedMessage.getDescription().role());
          assertEquals(
              message.getDescription().content(), cachedMessage.getDescription().content());
        }

        @Test
        public void should_iterate_messages_of_conversation() {
          int count = 0;
          for (var message : conversation.messages().findAll()) {
            count++;
          }
          assertEquals(messageCount, count);
        }

        @Test
        public void should_save_message_and_return_saved_message() {
          var description = new MessageDescription("user", "Hello, world!");
          Message savedMessage = conversation.saveMessage(description);

          assertEquals("user", savedMessage.getDescription().role());
          assertEquals("Hello, world!", savedMessage.getDescription().content());

          var retrievedMessage =
              conversation.messages().findByIdentity(savedMessage.getIdentity()).get();
          assertEquals(savedMessage.getIdentity(), retrievedMessage.getIdentity());
          assertEquals(
              savedMessage.getDescription().role(), retrievedMessage.getDescription().role());
          assertEquals(
              savedMessage.getDescription().content(), retrievedMessage.getDescription().content());
        }
      }
    }

    @Nested
    class UserAccountsTest {
      @Test
      public void should_get_accounts_association_of_user() {
        assertEquals(1, user.accounts().findAll().size());

        var firstResult = user.accounts().findAll();
        var secondResult = user.accounts().findAll();
        assertEquals(firstResult.size(), secondResult.size());
        assertEquals(1, secondResult.size());
      }

      @Test
      public void should_find_account_by_user_and_id() {
        String identity = user.accounts().findAll().iterator().next().getIdentity();
        assertEquals(identity, user.accounts().findByIdentity(identity).get().getIdentity());

        var cachedAccount = user.accounts().findByIdentity(identity).get();
        assertEquals(identity, cachedAccount.getIdentity());
      }

      @Test
      public void should_not_find_account_by_user_and_id_if_not_exist() {
        assertTrue(user.accounts().findByIdentity("-1").isEmpty());
      }
    }
  }
}
