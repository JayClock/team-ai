package reengineering.ddd.teamai.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class UserConversationsApiTest extends ApiTest {
  @MockitoBean
  private Users users;
  private User user;

  @Mock
  private Many<Conversation> conversations;
  private Conversation conversation;

  @BeforeEach
  public void beforeEach() {
    user = new User("JayClock", new UserDescription("JayClock", "JayClock@email"), mock(User.Accounts.class), mock(User.Conversations.class));
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    conversation = new Conversation("1", new ConversationDescription("title"));
  }

  @Test
  public void should_return_all_conversations_of_user_as_pages() {
    when(user.conversations().findAll()).thenReturn(conversations);
    when(conversations.size()).thenReturn(400);
    when(conversations.subCollection(eq(0), eq(40))).thenReturn(new EntityList<>(conversation));
    given().accept(MediaTypes.HAL_JSON.toString())
      .when().get("/users/" + user.getIdentity() + "/conversations")
      .then().statusCode(200)
      .body("_links.self.href", is("/api/users/" + user.getIdentity() + "/conversations?page=0"))
      .body("_links.next.href", is("/api/users/" + user.getIdentity() + "/conversations?page=1"))
      .body("_embedded.conversations.size()", is(1))
      .body("_embedded.conversations[0].id", is(conversation.getIdentity()))
      .body("_embedded.conversations[0].title", is(conversation.getDescription().title()));
  }
}
