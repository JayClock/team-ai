package reengineering.ddd;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.mybatis.associations.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@MybatisTest
@Import(FlywayConfig.class)
@ExtendWith(TestDataSetup.class)
public class AssociationsTest {
  @Inject
  private Users users;

  private User user;

  @BeforeEach
  public void setUp() {
    user = users.findById("1").get();
  }

  @Test
  public void should_find_user_by_id() {
    assertEquals("1", user.getIdentity());
    assertEquals("John Smith", user.getDescription().name());
    assertEquals("john.smith@email.com", user.getDescription().email());
  }

  @Test
  public void should_not_find_user_if_not_exist() {
    assertTrue(users.findById("-1").isEmpty());
  }

  @Test
  public void should_get_accounts() {
    assertEquals(1, user.accounts().findAll().size());
  }

  @Test
  public void should_find_account_by_id() {
    assertTrue(user.accounts().findByIdentity("1").isPresent());
  }

  @Test
  public void should_not_find_account_by_id_if_not_exist() {
    assertTrue(user.accounts().findByIdentity("-1").isEmpty());
  }

  @Test
  public void should_get_conversations_of_user() {
    assertEquals(1000, user.conversations().findAll().size());
  }

  @Test
  public void should_find_conversations_of_user() {
    assertEquals(100, user.conversations().findAll().subCollection(100, 200).size());
  }

  @Test
  public void should_find_conversation_by_of_user() {
    String identity = user.conversations().findAll().iterator().next().getIdentity();
    Conversation conversation = user.conversations().findByIdentity(identity).get();
    assertEquals(identity, conversation.getIdentity());
  }

  @Test
  public void should_not_find_conversations_of_user_if_not_exist() {
    assertTrue(user.conversations().findByIdentity("-1").isEmpty());
  }
}
