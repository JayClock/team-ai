package reengineering.ddd.teamai.api;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

public class UsersApiTest extends ApiTest {
  @MockBean
  private Users users;

  @Test
  public void should_return_404_if_customer_not_exist() {
    when(users.findById(eq("not_exist"))).thenReturn(Optional.empty());
    given().accept(MediaTypes.HAL_JSON.toString()).when().get("/users/not_exist").then().statusCode(404);
  }

  @Test
  public void should_return_user_if_user_exists() {
    User user = new User("john.smith",
      new UserDescription("John Smith", "john.smith@email.com"));
    when(users.findById(user.getIdentity())).thenReturn(Optional.of(user));

    given().accept(MediaTypes.HAL_JSON.toString())
      .when().get("/users/" + user.getIdentity())
      .then().statusCode(200)
      .body("id", is(user.getIdentity()))
      .body("name", is(user.getDescription().name()))
      .body("email", is(user.getDescription().email()))
      .body("_links.self.href", is("/api/users/" + user.getIdentity()));
  }
}
