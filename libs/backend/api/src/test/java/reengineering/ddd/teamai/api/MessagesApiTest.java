package reengineering.ddd.teamai.api;

import java.util.Optional;

import static org.hamcrest.Matchers.is;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import jakarta.ws.rs.core.MediaType;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class MessagesApiTest extends ApiTest {
  @MockitoBean
  private Users users;

  @Mock
  private Many<Message> messages;

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
  public void should_return_all_messages_of_conversation_as_pages() {
    MessageDescription description = new MessageDescription("user", "content");
    Message message = new Message("1", description);
    when(conversation.messages().findAll()).thenReturn(messages);
    when(messages.size()).thenReturn(400);
    when(messages.subCollection(0, 40)).thenReturn(new EntityList<>(message));
    given()
        .accept(MediaTypes.HAL_JSON.toString())
        .when().get("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages")
        .then().statusCode(200)
        .body("_links.self.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity()
                + "/messages?page=0"))
        .body("_links.next.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity()
                + "/messages?page=1"))
        .body("_embedded.messages[0].id", is(message.getIdentity()))
        .body("_embedded.messages[0].role", is(message.getDescription().role()))
        .body("_embedded.messages[0].content", is(message.getDescription().content()));
  }

  @Test
  public void should_send_message_and_receive_streaming_response() {
    MessageDescription description = new MessageDescription("user", "content");
    when(conversation.sendMessage(description)).thenReturn(Flux.just("data"));
    given()
        .accept(MediaType.SERVER_SENT_EVENTS)
        .contentType(MediaType.APPLICATION_JSON)
        .body(description)
        .when().post("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages")
        .then().statusCode(200);
  }
}
