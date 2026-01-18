package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.core.Is.is;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.payload.PayloadDocumentation.responseFields;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.*;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Account;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class AccountsApiTest extends ApiTest {
  @MockitoBean private Users users;
  private User user;

  @Mock private User.Accounts accounts;
  private Account account;

  @BeforeEach
  public void beforeEach() {
    user =
        new User(
            "JayClock",
            new UserDescription("JayClock", "JayClock@email"),
            accounts,
            mock(User.Conversations.class),
            mock(User.Projects.class));
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    account = new Account("2", new AccountDescription("github", "github02"));
    when(user.accounts().findAll()).thenReturn(new EntityList<>(account));
  }

  @Test
  public void should_return_accounts_in_user() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .filter(
            document(
                "accounts/list",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user")),
                responseFields(accountsCollectionResponseFields())))
        .when()
        .get("/users/{userId}/accounts", user.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.accounts.size()", is(1))
        .body("_embedded.accounts[0].id", is(account.getIdentity()))
        .body("_embedded.accounts[0].provider", is(account.getDescription().provider()))
        .body("_embedded.accounts[0].providerId", is(account.getDescription().providerId()))
        .body(
            "_embedded.accounts[0]._links.self.href",
            is("/api/users/" + user.getIdentity() + "/accounts/" + account.getIdentity()));

    verify(user.accounts(), times(1)).findAll();
  }
}
