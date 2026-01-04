package reengineering.ddd.teamai.api;

import org.junit.jupiter.api.Test;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

public class UsersApiTest extends ApiTest {
  @MockitoBean
  private Users users;

  @Test
  public void should_return_404_if_customer_not_exist() {
    when(users.findById(eq("not_exist"))).thenReturn(Optional.empty());
    given().accept(MediaTypes.HAL_JSON.toString()).when().get("/users/not_exist").then().statusCode(404);
  }

  @Test
  public void should_return_user_if_user_exists() {
    User.Accounts accounts = mock(User.Accounts.class);
    User.Conversations conversations = mock(User.Conversations.class);
    User user = new User("john.smith",
      new UserDescription("John Smith", "john.smith@email.com"), accounts, conversations);
    when(users.findById(user.getIdentity())).thenReturn(Optional.of(user));

    given().accept(MediaTypes.HAL_FORMS_JSON_VALUE)
      .when().get("/users/" + user.getIdentity())
      .then().statusCode(200)
      .body("id", is(user.getIdentity()))
      .body("name", is(user.getDescription().name()))
      .body("email", is(user.getDescription().email()))
      .body("_links.self.href", is("/api/users/" + user.getIdentity()))
      .body("_links.accounts.href", is("/api/users/" + user.getIdentity() + "/accounts"))
      .body("_links.conversations.href", is("/api/users/" + user.getIdentity() + "/conversations"))
      .body("_links.create-conversation.href", is("/api/users/" + user.getIdentity() + "/conversations"))
      .body("_templates.default.method", is("PUT"))
      .body("_templates.default.properties", hasSize(2))
      .body("_templates.create-conversation.method", is("POST"))
      .body("_templates.create-conversation.properties", hasSize(1));

    verify(users, times(1)).findById(user.getIdentity());

    given().accept(MediaTypes.HAL_FORMS_JSON_VALUE)
      .when().get("/users/" + user.getIdentity())
      .then().statusCode(200)
      .body("id", is(user.getIdentity()))
      .body("name", is(user.getDescription().name()));

    verify(users, times(1)).findById(user.getIdentity());
  }
}
