package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

public class MemberTest {

  @Nested
  @DisplayName("Identity")
  class Identity {

    @Test
    @DisplayName("should return user identity")
    void shouldReturnUserIdentity() {
      String userId = "user-123";
      String role = "EDITOR";
      Member member = new Member(userId, role);

      assertEquals(userId, member.getUserIdentity());
      assertEquals(userId, member.getIdentity());
    }
  }

  @Nested
  @DisplayName("Role")
  class Role {

    @Test
    @DisplayName("should return role")
    void shouldReturnRole() {
      String userId = "user-123";
      String role = "OWNER";
      Member member = new Member(userId, role);

      assertEquals(role, member.getRole());
    }
  }
}
