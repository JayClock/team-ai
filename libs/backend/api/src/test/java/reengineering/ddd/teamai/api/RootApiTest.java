package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

public class RootApiTest extends ApiTest {

  @Test
  public void should_return_anonymous_root_model_for_unauthenticated_user() {
    given()
        .accept(ContentType.JSON)
        .when()
        .get("/")
        .then()
        .statusCode(200)
        .contentType(ContentType.JSON)
        .body("_links.self.href", notNullValue())
        .body("_links.login.href", equalTo("/oauth2/authorization/github"));
  }
}
