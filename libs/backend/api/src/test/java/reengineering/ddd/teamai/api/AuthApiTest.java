package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import reengineering.ddd.archtype.HasOne;
import reengineering.ddd.teamai.description.LocalCredentialDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.LocalCredential;
import reengineering.ddd.teamai.model.User;

public class AuthApiTest extends ApiTest {

  @Test
  public void should_login_with_local_credentials() {
    User user = user("1", "john");
    when(authenticationManager.authenticate(any())).thenReturn(mock(Authentication.class));
    when(users.findByUsername("john")).thenReturn(Optional.of(user));
    when(jwtUtil.generateToken(user)).thenReturn("jwt-token");

    given(documentationSpec)
        .contentType("application/json")
        .body("{\"username\":\"john\",\"password\":\"password123\"}")
        .when()
        .post("/auth/login")
        .then()
        .statusCode(200)
        .body("token", equalTo("jwt-token"))
        .body("userId", equalTo("1"))
        .header("Set-Cookie", containsString("auth_token=jwt-token"));
  }

  @Test
  public void should_reject_invalid_login() {
    when(authenticationManager.authenticate(any()))
        .thenThrow(new BadCredentialsException("Bad credentials"));

    given(documentationSpec)
        .contentType("application/json")
        .body("{\"username\":\"john\",\"password\":\"wrong-password\"}")
        .when()
        .post("/auth/login")
        .then()
        .statusCode(401);
  }

  @Test
  public void should_register_new_local_user() {
    User user = user("7", "john");
    when(users.findByUsername("john")).thenReturn(Optional.empty());
    when(users.findByEmail("john@example.com")).thenReturn(Optional.empty());
    when(users.createUser(any())).thenReturn(user);
    when(passwordEncoder.encode("password123")).thenReturn("hashed-password");
    when(users.bindLocalCredential(any(), any()))
        .thenReturn(
            new LocalCredential("7", new LocalCredentialDescription("john", "hashed-password")));
    when(jwtUtil.generateToken(user)).thenReturn("jwt-register");

    given(documentationSpec)
        .contentType("application/json")
        .body(
            """
            {
              "name": "John Doe",
              "email": "john@example.com",
              "username": "john",
              "password": "password123"
            }
            """)
        .when()
        .post("/auth/register")
        .then()
        .statusCode(201)
        .body("token", equalTo("jwt-register"))
        .body("userId", equalTo("7"));
  }

  @Test
  public void should_require_authentication_for_bind_local() {
    given(documentationSpec)
        .contentType("application/json")
        .body("{\"username\":\"john\",\"password\":\"password123\"}")
        .when()
        .post("/auth/bind-local")
        .then()
        .statusCode(401);
  }

  private User user(String userId, String username) {
    HasOne<LocalCredential> credential = mock(HasOne.class);
    when(credential.get())
        .thenReturn(
            new LocalCredential(
                userId, new LocalCredentialDescription(username, "hashed-password")));
    return new User(
        userId,
        new UserDescription("John Doe", "john@example.com"),
        mock(User.Accounts.class),
        credential,
        mock(User.Projects.class));
  }
}
