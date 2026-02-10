package reengineering.ddd.teamai.model;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.MemberDescription;

public class MemberTest {

  @Nested
  @DisplayName("Identity")
  class Identity {

    @Test
    @DisplayName("should return user identity")
    void shouldReturnUserIdentity() {
      String userId = "user-123";
      String role = "EDITOR";
      MemberDescription description = new MemberDescription(new Ref<>(userId), role);
      Member member = new Member(userId, description);

      assertEquals(userId, member.getIdentity());
      assertEquals(userId, member.getDescription().user().id());
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
      MemberDescription description = new MemberDescription(new Ref<>(userId), role);
      Member member = new Member(userId, description);

      assertEquals(role, member.getDescription().role());
    }
  }
}
