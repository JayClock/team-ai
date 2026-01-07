package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@MybatisTest
@Import(TestContainerConfig.class)
public class UserAccountsTest {
  @Inject
  private Users users;

  private User user;

  @BeforeEach
  public void setUp() {
    user = users.createUser(new UserDescription("john.smith", "john.smith@email.com"));
    user.add(new AccountDescription("github", "github01"));
  }

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
