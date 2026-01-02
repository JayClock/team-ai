package reengineering.ddd.teamai.api;

import jakarta.ws.rs.core.MediaType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.Many;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class MessagesApiTest extends ApiTest {
  @MockitoBean
  private Users users;

  private User user;
  private Conversation conversation;

  @BeforeEach
  public void beforeEach() {
    user = new User("JayClock", new UserDescription("JayClock", "JayClock@email"), mock(User.Accounts.class),
      mock(User.Conversations.class));
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    conversation = new Conversation("1", new ConversationDescription("title"), mock(Conversation.Messages.class));
    when(user.conversations().findByIdentity(conversation.getIdentity())).thenReturn(Optional.ofNullable(conversation));
  }

  @Test
  public void should_return_all_messages_of_conversation() {
    MessageDescription description = new MessageDescription("user", "content");
    Message message = new Message("1", description);
    Message message2 = new Message("2", new MessageDescription("assistant", "response"));

    when(conversation.messages().findAll()).thenReturn(new EntityList<>(message, message2));

    given()
      .accept(MediaTypes.HAL_JSON.toString())
      .when().get("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages")
      .then().statusCode(200)
      .body("_embedded.messages.size()", is(2))
      .body("_embedded.messages[0].id", is(message.getIdentity()))
      .body("_embedded.messages[0].role", is(message.getDescription().role()))
      .body("_embedded.messages[0].content", is(message.getDescription().content()))
      .body("_embedded.messages[1].id", is(message2.getIdentity()))
      .body("_embedded.messages[1].role", is(message2.getDescription().role()))
      .body("_embedded.messages[1].content", is(message2.getDescription().content()));
  }

  @Test
  public void should_send_message_and_receive_streaming_response() {
    MessageDescription description = new MessageDescription("user", "content");
    when(conversation.sendMessage(description)).thenReturn(Flux.just("data"));
    given()
      .urlEncodingEnabled(false)
      .accept(MediaType.SERVER_SENT_EVENTS)
      .contentType(MediaType.APPLICATION_JSON)
      .body(description)
      .when().post("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages:chat")
      .then().statusCode(200);
  }
}
