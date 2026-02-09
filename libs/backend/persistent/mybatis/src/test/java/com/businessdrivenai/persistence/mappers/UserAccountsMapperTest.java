package com.businessdrivenai.persistence.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.businessdrivenai.domain.description.AccountDescription;
import com.businessdrivenai.domain.model.Account;
import com.businessdrivenai.persistence.TestContainerConfig;
import com.businessdrivenai.persistence.mybatis.mappers.UserAccountsMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;

@MybatisTest
@Import(TestContainerConfig.class)
public class UserAccountsMapperTest {
  @Inject private TestDataMapper testData;
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
