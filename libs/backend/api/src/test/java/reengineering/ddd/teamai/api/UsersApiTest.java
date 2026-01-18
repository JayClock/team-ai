package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
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
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.conversationsLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.projectsLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.selfLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.userResponseFields;

import io.restassured.http.ContentType;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class UsersApiTest extends ApiTest {
  @MockitoBean private Users users;

  @Test
  public void should_return_404_if_customer_not_exist() {
    when(users.findById(eq("not_exist"))).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .filter(
            document(
                "users/get-not-found",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"))))
        .when()
        .get("/users/{userId}", "not_exist")
        .then()
        .statusCode(404);
  }

  @Test
  public void should_return_user_if_user_exists() {
    User.Accounts accounts = mock(User.Accounts.class);
    User.Conversations conversations = mock(User.Conversations.class);
    User.Projects projects = mock(User.Projects.class);
    User user =
        new User(
            "john.smith",
            new UserDescription("John Smith", "john.smith@email.com"),
            accounts,
            conversations,
            projects);
    when(users.findById(user.getIdentity())).thenReturn(Optional.of(user));
    when(accounts.findAll()).thenReturn(new EntityList<>());
    when(projects.findAll()).thenReturn(new EntityList<>());

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "users/get-user",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user")),
                responseFields(userResponseFields()),
                halLinksSnippet(selfLink(), accountsLink(), conversationsLink(), projectsLink())))
        .when()
        .get("/users/{userId}", user.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(user.getIdentity()))
        .body("name", is(user.getDescription().name()))
        .body("email", is(user.getDescription().email()))
        .body("_links.self.href", is("/api/users/" + user.getIdentity()))
        .body("_links.accounts.href", is("/api/users/" + user.getIdentity() + "/accounts"))
        .body(
            "_links.conversations.href", is("/api/users/" + user.getIdentity() + "/conversations"))
        .body("_links.projects.href", is("/api/users/" + user.getIdentity() + "/projects"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(2))
        .body("_templates.create-project.method", is("POST"))
        .body("_templates.create-project.properties", hasSize(2));

    verify(users, times(1)).findById(user.getIdentity());
  }

  @Test
  public void should_update_user() {
    User.Accounts accounts = mock(User.Accounts.class);
    User.Conversations conversations = mock(User.Conversations.class);
    User.Projects projects = mock(User.Projects.class);
    User user =
        new User(
            "john.smith",
            new UserDescription("John Smith", "john.smith@email.com"),
            accounts,
            conversations,
            projects);
    User updatedUser =
        new User(
            "john.smith",
            new UserDescription("John Updated", "john.updated@email.com"),
            accounts,
            conversations,
            projects);
    when(users.findById(user.getIdentity()))
        .thenReturn(Optional.of(user))
        .thenReturn(Optional.of(updatedUser));
    when(accounts.findAll()).thenReturn(new EntityList<>());
    when(projects.findAll()).thenReturn(new EntityList<>());

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

    verify(users).update(eq("john.smith"), any(User.UserChange.class));
  }
}
