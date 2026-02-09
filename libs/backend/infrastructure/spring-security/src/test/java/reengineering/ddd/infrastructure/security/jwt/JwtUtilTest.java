package reengineering.ddd.infrastructure.security.jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.businessdrivenai.domain.description.UserDescription;
import com.businessdrivenai.domain.model.User;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class JwtUtilTest {

  private static final String TEST_SECRET = "test-secret-key-that-is-long-enough-for-testing";
  private static final long TEST_EXPIRATION_MS = 86400000L; // 24 hours

  @Mock private User user;

  @Mock private User.Accounts accounts;

  private JwtUtil jwtUtil;

  @BeforeEach
  void setUp() {
    jwtUtil = new JwtUtil(TEST_SECRET, TEST_EXPIRATION_MS);
  }

  @Test
  void should_generate_token_with_user_claims() {
    when(user.getIdentity()).thenReturn("user-123");
    when(user.getDescription()).thenReturn(new UserDescription("John Doe", "john@example.com"));

    String token = jwtUtil.generateToken(user);

    assertThat(token).isNotNull();
    assertThat(token).isNotEmpty();
    assertThat(token.split("\\.")).hasSize(3); // JWT has 3 parts
  }

  @Test
  void should_extract_user_id_from_valid_token() {
    when(user.getIdentity()).thenReturn("user-456");
    when(user.getDescription()).thenReturn(new UserDescription("Jane Doe", "jane@example.com"));

    String token = jwtUtil.generateToken(user);
    Optional<String> userId = jwtUtil.getUserIdFromToken(token);

    assertThat(userId).isPresent();
    assertThat(userId.get()).isEqualTo("user-456");
  }

  @Test
  void should_return_empty_for_invalid_token() {
    Optional<String> userId = jwtUtil.getUserIdFromToken("invalid.token.here");

    assertThat(userId).isEmpty();
  }

  @Test
  void should_return_empty_for_malformed_token() {
    Optional<String> userId = jwtUtil.getUserIdFromToken("not-a-jwt");

    assertThat(userId).isEmpty();
  }

  @Test
  void should_return_empty_for_empty_token() {
    Optional<String> userId = jwtUtil.getUserIdFromToken("");

    assertThat(userId).isEmpty();
  }

  @Test
  void should_validate_correct_token() {
    when(user.getIdentity()).thenReturn("user-789");
    when(user.getDescription()).thenReturn(new UserDescription("Test User", "test@example.com"));

    String token = jwtUtil.generateToken(user);
    boolean isValid = jwtUtil.validateToken(token);

    assertThat(isValid).isTrue();
  }

  @Test
  void should_invalidate_incorrect_token() {
    boolean isValid = jwtUtil.validateToken("invalid-token");

    assertThat(isValid).isFalse();
  }

  @Test
  void should_return_empty_for_token_signed_with_different_secret() {
    when(user.getIdentity()).thenReturn("user-123");
    when(user.getDescription()).thenReturn(new UserDescription("Test", "test@test.com"));

    String token = jwtUtil.generateToken(user);

    JwtUtil differentJwtUtil =
        new JwtUtil("different-secret-key-that-is-also-long", TEST_EXPIRATION_MS);
    Optional<String> userId = differentJwtUtil.getUserIdFromToken(token);

    assertThat(userId).isEmpty();
  }

  @Test
  void should_handle_short_secret_by_padding() {
    JwtUtil shortSecretJwtUtil = new JwtUtil("short", TEST_EXPIRATION_MS);

    when(user.getIdentity()).thenReturn("user-short");
    when(user.getDescription())
        .thenReturn(new UserDescription("Short Secret User", "short@test.com"));

    String token = shortSecretJwtUtil.generateToken(user);
    Optional<String> userId = shortSecretJwtUtil.getUserIdFromToken(token);

    assertThat(userId).isPresent();
    assertThat(userId.get()).isEqualTo("user-short");
  }

  @Test
  void should_return_empty_for_expired_token() {
    JwtUtil expiredJwtUtil = new JwtUtil(TEST_SECRET, -1000L); // Already expired

    when(user.getIdentity()).thenReturn("user-expired");
    when(user.getDescription()).thenReturn(new UserDescription("Expired User", "expired@test.com"));

    String token = expiredJwtUtil.generateToken(user);
    Optional<String> userId = jwtUtil.getUserIdFromToken(token);

    assertThat(userId).isEmpty();
  }
}
