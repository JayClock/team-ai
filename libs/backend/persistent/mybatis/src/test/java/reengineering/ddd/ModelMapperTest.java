package reengineering.ddd;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.mappers.AccountsMapper;
import reengineering.ddd.teamai.mybatis.mappers.ConversationsMapper;
import reengineering.ddd.teamai.mybatis.mappers.UsersMapper;

import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;

@MybatisTest
public class ModelMapperTest {
  @Inject
  private UsersMapper usersMapper;
  @Inject
  private AccountsMapper accountsMapper;
  @Inject
  private ConversationsMapper conversationsMapper;
  @Inject
  private TestDataMapper testData;

  private final String userId = id();
  private final String accountId = id();
  private final String conversationId = id();

  private static String id() {
    return String.valueOf(new Random().nextInt(100000));
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith@email.com");
    testData.insertAccount(accountId, "provider", "providerId", userId);
    testData.insertConversation(conversationId, "title", userId);
  }

  @Test
  public void should_find_user_by_id() {
    User user = usersMapper.findUserById(userId);
    assertEquals(user.getIdentity(), userId);
    assertEquals("john.smith@email.com", user.getDescription().email());
    assertEquals("John Smith", user.getDescription().name());
  }

  @Test
  public void should_assign_accounts_association() {
    User user = usersMapper.findUserById(userId);
    assertEquals(1, user.accounts().findAll().size());
  }

  @Test
  public void should_find_account_by_user_and_id() {
    User user = usersMapper.findUserById(userId);
    Account account = accountsMapper.findAccountByUserAndId(user.getIdentity(), accountId);
    assertEquals(accountId, account.getIdentity());
  }

  @Test
  void should_assign_conversation_association() {
    User user = usersMapper.findUserById(userId);
    assertEquals(1, user.accounts().findAll().size());
  }

  @Test
  void should_find_conversation_by_user_and_id() {
    User user = usersMapper.findUserById(userId);
    Conversation conversation = conversationsMapper.findConversationByUserAndId(user.getIdentity(), conversationId);
    assertEquals(conversationId, conversation.getIdentity());
  }

  @Test
  public void should_add_user_to_database() {
    IdHolder idHolder = new IdHolder();
    usersMapper.insertUser(idHolder, new UserDescription("JayClock", "JayClock@email.com"));
    User user = usersMapper.findUserById(idHolder.id());
    assertEquals("JayClock", user.getDescription().name());
  }

  @Test
  public void should_add_account_to_database() {
    IdHolder idHolder = new IdHolder();
    accountsMapper.insertAccount(idHolder, userId, new AccountDescription("provider", "providerId2"));
    Account account = accountsMapper.findAccountByUserAndId(userId, idHolder.id());
    assertEquals(account.getIdentity(), idHolder.id());
  }

  @Test
  public void should_add_conversation_to_database() {
    IdHolder idHolder = new IdHolder();
    conversationsMapper.insertConversation(idHolder, userId, new ConversationDescription("title"));
    Conversation conversation = conversationsMapper.findConversationByUserAndId(userId, idHolder.id());
    assertEquals(conversation.getIdentity(), idHolder.id());
  }
}
