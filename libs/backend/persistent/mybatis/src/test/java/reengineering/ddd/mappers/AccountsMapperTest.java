package reengineering.ddd.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.TestContainerConfig;
import reengineering.ddd.mybatis.support.IdHolder;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.mybatis.mappers.UserAccountsMapper;

@MybatisTest
@Import(TestContainerConfig.class)
public class AccountsMapperTest {
  @Inject private reengineering.ddd.TestDataMapper testData;
  @Inject private UserAccountsMapper accountsMapper;

  private final int userId = id();
  private final int accountId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
    testData.insertAccount(accountId, "provider", "providerId" + accountId, userId);
  }

  @Test
  public void should_find_account_by_user_and_id() {
    Account account = accountsMapper.findAccountByUserAndId(userId, accountId);
    assertEquals(String.valueOf(accountId), account.getIdentity());
  }

  @Test
  public void should_add_account_to_database() {
    IdHolder idHolder = new IdHolder();
    accountsMapper.insertAccount(
        idHolder, userId, new AccountDescription("provider", "providerId2"));
    Account account = accountsMapper.findAccountByUserAndId(userId, idHolder.id());
    assertEquals(account.getIdentity(), String.valueOf(idHolder.id()));
  }
}
