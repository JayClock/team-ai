package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.payload.PayloadDocumentation.responseFields;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.accountsLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.selfLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.userResponseFields;

import io.restassured.http.ContentType;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.User;

public class UsersApiTest extends ApiTest {

  @Test
  public void should_return_404_if_customer_not_exist() {
    when(users.findByIdentity(eq("not_exist"))).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .filter(
            document(
                "users/get-not-found",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of user"))))
        .when()
        .get("/users/{userId}", "not_exist")
        .then()
        .statusCode(404);
  }

  @Test
  public void should_return_user_if_user_exists() {
    User.Accounts accounts = mock(User.Accounts.class);
    User.Projects projects = mock(User.Projects.class);
    User user =
        new User(
            "john.smith",
            new UserDescription("John Smith", "john.smith@email.com"),
            accounts,
            projects);

    Account account1 =
        new Account("account-1", new AccountDescription("github", "github-user-123"));
    Account account2 =
        new Account("account-2", new AccountDescription("google", "google-user-456"));

    when(users.findByIdentity(user.getIdentity())).thenReturn(Optional.of(user));
    when(accounts.findAll()).thenReturn(new EntityList<>(List.of(account1, account2)));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "users/get-user-complete",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user")),
                responseFields(userResponseFields()),
                halLinksSnippet(selfLink(), accountsLink())))
        .when()
        .get("/users/{userId}", user.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.USER))
        .body("id", is(user.getIdentity()))
        .body("name", is("John Smith"))
        .body("email", is("john.smith@email.com"))
        .body("_embedded.accounts", hasSize(2))
        .body("_embedded.accounts[0].id", is("account-1"))
        .body("_embedded.accounts[0].provider", is("github"))
        .body("_embedded.accounts[0].providerId", is("github-user-123"))
        .body(
            "_embedded.accounts[0]._links.self.href",
            is("/api/users/john.smith/accounts/account-1"))
        .body("_embedded.accounts[1].id", is("account-2"))
        .body("_embedded.accounts[1].provider", is("google"))
        .body("_embedded.accounts[1].providerId", is("google-user-456"))
        .body(
            "_embedded.accounts[1]._links.self.href",
            is("/api/users/john.smith/accounts/account-2"))
        .body("_links.self.href", is("/api/users/john.smith"))
        .body("_links.accounts.href", is("/api/users/john.smith/accounts"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(2))
        .body("_templates.default.properties[0].name", is("email"))
        .body("_templates.default.properties[1].name", is("name"));

    verify(users, times(1)).findByIdentity(user.getIdentity());
  }

  @Test
  public void should_update_user() {
    User.Accounts accounts = mock(User.Accounts.class);
    User.Projects projects = mock(User.Projects.class);
    User user =
        new User(
            "john.smith",
            new UserDescription("John Smith", "john.smith@email.com"),
            accounts,
            projects);
    User updatedUser =
        new User(
            "john.smith",
            new UserDescription("John Updated", "john.updated@email.com"),
            accounts,
            projects);
    when(users.findByIdentity(user.getIdentity()))
        .thenReturn(Optional.of(user))
        .thenReturn(Optional.of(updatedUser));
    when(accounts.findAll()).thenReturn(new EntityList<>());

    given(documentationSpec)
        .contentType(ContentType.JSON)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .body("{\"name\": \"John Updated\", \"email\": \"john.updated@email.com\"}")
        .filter(
            document(
                "users/update-user",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"))))
        .when()
        .put("/users/{userId}", user.getIdentity())
        .then()
        .statusCode(200)
        .body("name", is("John Updated"))
        .body("email", is("john.updated@email.com"));

    verify(users).update(eq("john.smith"), any(UserDescription.class));
  }
}
