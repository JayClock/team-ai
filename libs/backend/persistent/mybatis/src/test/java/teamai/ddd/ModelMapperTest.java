package teamai.ddd;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import teamai.ddd.mappers.UsersMapper;
import teamai.ddd.model.User;

import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;

@MybatisTest
public class ModelMapperTest {
  @Inject
  private UsersMapper usersMapper;
  @Inject
  private TestDataMapper testData;

  private final String userId = id();

  private static String id() {
    return String.valueOf(new Random().nextInt(100000));
  }

  @BeforeEach
  public void before() {
    testData.insertUser(userId, "John Smith", "john.smith@email.com");
  }

  @Test
  public void should_find_user_by_id() {
    User user = usersMapper.findUserById(userId);
    assertEquals(user.getIdentity(), userId);
    assertEquals("john.smith@email.com", user.getDescription().email());
    assertEquals("John Smith", user.getDescription().name());
  }
}
