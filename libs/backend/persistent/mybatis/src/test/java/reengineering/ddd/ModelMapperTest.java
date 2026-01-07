package reengineering.ddd;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.ConversationMessagesMapper;
import reengineering.ddd.teamai.mybatis.mappers.UserAccountsMapper;
import reengineering.ddd.teamai.mybatis.mappers.UserConversationsMapper;
import reengineering.ddd.teamai.mybatis.mappers.UsersMapper;

import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;

@MybatisTest
@Import(TestContainerConfig.class)
public class ModelMapperTest {
  @Inject
  private TestDataMapper testData;

  private final int userId = id();
  private final int accountId = id();
  private final int conversationId = id();
  private final int messageId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertAccount(accountId, "provider", "providerId" + accountId, userId);
    testData.insertConversation(conversationId, "title" + conversationId, userId);
    testData.insertMessage(messageId, conversationId, "role", "content");
  }

  @Nested
  class UsersMapperTest {
    @Inject
    private UsersMapper usersMapper;

    @Test
    public void should_find_user_by_id() {
      User user = usersMapper.findUserById(userId);
      assertEquals(user.getIdentity(), String.valueOf(userId));
      assertEquals("john.smith+" + userId + "@email.com", user.getDescription().email());
      assertEquals("John Smith", user.getDescription().name());
    }

    @Test
    public void should_assign_accounts_association_of_user() {
      User user = usersMapper.findUserById(userId);
      assertEquals(1, user.accounts().findAll().size());
    }

    @Test
    public void should_assign_conversations_association_of_user() {
      User user = usersMapper.findUserById(userId);
      assertEquals(1, user.accounts().findAll().size());
    }

    @Test
    public void should_add_user_to_database() {
      IdHolder idHolder = new IdHolder();
      usersMapper.insertUser(idHolder, new UserDescription("JayClock", "JayClock@email.com"));
      User user = usersMapper.findUserById(idHolder.id());
      assertEquals("JayClock", user.getDescription().name());
    }

    @Test
    public void should_update_name_if_email_exist() {
      IdHolder idHolder = new IdHolder();
      usersMapper.insertUser(idHolder, new UserDescription("John Smith", "JayClock@email.com"));
      User user = usersMapper.findUserById(idHolder.id());
      assertEquals("John Smith", user.getDescription().name());
    }
  }

  @Nested
  class AccountsMapperTest {
    @Inject
    private UserAccountsMapper accountsMapper;

    @Test
    public void should_find_account_by_user_and_id() {
      Account account = accountsMapper.findAccountByUserAndId(userId, accountId);
      assertEquals(String.valueOf(accountId), account.getIdentity());
    }

    @Test
    public void should_add_account_to_database() {
      IdHolder idHolder = new IdHolder();
      accountsMapper.insertAccount(idHolder, userId, new AccountDescription("provider", "providerId2"));
      Account account = accountsMapper.findAccountByUserAndId(userId, idHolder.id());
      assertEquals(account.getIdentity(), String.valueOf(idHolder.id()));
    }
  }

  @Nested
  class ConversationsMapperTest {
    @Inject
    private UserConversationsMapper conversationsMapper;

    @Test
    void should_find_conversation_by_user_and_id() {
      Conversation conversation = conversationsMapper.findConversationByUserAndId(userId, conversationId);
      assertEquals(String.valueOf(conversationId), conversation.getIdentity());
    }

    @Test
    void should_assign_messages_association_of_conversation() {
      Conversation conversation = conversationsMapper.findConversationByUserAndId(userId, conversationId);
      assertEquals(1, conversation.messages().findAll().size());
    }

    @Test
    public void should_add_conversation_to_database() {
      IdHolder idHolder = new IdHolder();
      conversationsMapper.insertConversation(idHolder, userId, new ConversationDescription("title"));
      Conversation conversation = conversationsMapper.findConversationByUserAndId(userId, idHolder.id());
      assertEquals(conversation.getIdentity(), String.valueOf(idHolder.id()));
    }
  }

  @Nested
  class MessagesMapperTest {
    @Inject
    private ConversationMessagesMapper messagesMapper;

    @Test
    public void should_find_message_by_conversation_and_id() {
      Message message = messagesMapper.findMessageByConversationAndId(conversationId, messageId);
      assertEquals(String.valueOf(messageId), message.getIdentity());
    }

    @Test
    public void should_add_message_to_database() {
      IdHolder idHolder = new IdHolder();
      messagesMapper.insertMessage(idHolder, conversationId, new MessageDescription("role", "description"));
      Message message = messagesMapper.findMessageByConversationAndId(conversationId, idHolder.id());
      assertEquals(message.getIdentity(), String.valueOf(idHolder.id()));
    }
  }
}
