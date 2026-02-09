package com.businessdrivenai.persistence.mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.businessdrivenai.domain.description.UserDescription;
import com.businessdrivenai.domain.model.User;
import com.businessdrivenai.persistence.TestContainerConfig;
import com.businessdrivenai.persistence.mybatis.mappers.UsersMapper;
import com.businessdrivenai.persistence.support.IdHolder;
import jakarta.inject.Inject;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;

@MybatisTest
@Import(TestContainerConfig.class)
public class UsersMapperTest {
  @Inject private TestDataMapper testData;
  @Inject private UsersMapper usersMapper;

  private final int userId = id();

  private static int id() {
    return new Random().nextInt(100000);
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith+" + userId + "@email.com");
  }

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
