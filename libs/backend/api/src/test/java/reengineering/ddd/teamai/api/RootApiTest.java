package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.restdocs.payload.PayloadDocumentation.responseFields;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.*;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;

import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

public class RootApiTest extends ApiTest {
  @Test
  public void should_return_anonymous_root_model_for_unauthenticated_user() {
    given(documentationSpec)
        .accept(ContentType.JSON)
        .filter(
            document(
                "root/anonymous",
                responseFields(rootResponseFields()),
                halLinksSnippet(selfLink(), loginLink(), loginOauthGithubLink())))
        .when()
        .get("/")
        .then()
        .statusCode(200)
        .contentType(ContentType.JSON)
        .body("_links.self.href", notNullValue())
        .body("_links.login.href", equalTo("/api/auth/login"))
        .body("_links.login-oauth-github.href", equalTo("/oauth2/authorization/github"));
  }
}
