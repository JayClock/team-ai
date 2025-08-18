package reengineering.ddd.teamai.api;

import jakarta.ws.rs.core.MediaType;
import org.apache.http.HttpHeaders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class MessagesApiTest extends ApiTest {
  private static final Logger log = LoggerFactory.getLogger(MessagesApiTest.class);
  @MockitoBean
  private Users users;

  private User user;
  private Conversation conversation;

  @BeforeEach
  public void beforeEach() {
    user = new User("JayClock", new UserDescription("JayClock", "JayClock@email"), mock(User.Accounts.class), mock(User.Conversations.class));
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    conversation = new Conversation("1", new ConversationDescription("title"), mock(Conversation.Messages.class));
    when(user.conversations().findByIdentity(conversation.getIdentity())).thenReturn(Optional.ofNullable(conversation));
  }

  @Test
  public void should_create_new_message() {
    MessageDescription description = new MessageDescription("user", "content");
    Message message = new Message("1", description);
    when(conversation.add(any(MessageDescription.class))).thenReturn(message);
    given()
      .accept(MediaTypes.HAL_JSON_VALUE)
      .contentType(MediaType.APPLICATION_JSON)
      .body(description)
      .when().post("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages")
      .then().statusCode(201)
      .header(HttpHeaders.LOCATION, is(uri("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages/" + message.getIdentity())))
      .body("id", is(message.getIdentity()))
      .body("role", is(message.getDescription().role()))
      .body("content", is(message.getDescription().content()))
      .body("_links.ai-response.href", is(uri("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages" + "?since=" + message.getIdentity())));
  }
}
