package reengineering.ddd.associations;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import reengineering.ddd.BaseTestContainersTest;
import reengineering.ddd.TestDataMapper;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@MybatisTest
public class UsersTest extends BaseTestContainersTest {
  @Inject
  private Users users;
  private User user;

  @Inject
  private TestDataMapper testDataMapper;

  private int userId = 1;

  @BeforeEach
  public void setUp() {
    testDataMapper.insertUser(userId, "John Smith", "john.smith@email.com");
    user = users.findById(String.valueOf(userId)).get();
  }

  @Test
  public void should_find_user_by_id() {
    assertEquals(String.valueOf(userId), user.getIdentity());
    assertEquals("John Smith", user.getDescription().name());
    assertEquals("john.smith@email.com", user.getDescription().email());
  }

  @Test
  public void should_not_find_user_if_not_exist() {
    assertTrue(users.findById("-1").isEmpty());
  }
}
