package reengineering.ddd;

import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.context.annotation.Import;
import reengineering.ddd.associations.Users;
import reengineering.ddd.model.User;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
