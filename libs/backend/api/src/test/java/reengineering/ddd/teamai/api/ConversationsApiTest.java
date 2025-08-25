package reengineering.ddd.teamai.api;

import java.util.Optional;

import org.apache.http.HttpHeaders;
import static org.hamcrest.Matchers.is;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.Mock;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static io.restassured.RestAssured.given;
import jakarta.ws.rs.HttpMethod;
import jakarta.ws.rs.core.MediaType;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class ConversationsApiTest extends ApiTest {
  @MockitoBean
  private Users users;
  private User user;

  @Mock
  private Many<Conversation> conversations;
  private Conversation conversation;

  @BeforeEach
  public void beforeEach() {
    user = new User("JayClock", new UserDescription("JayClock", "JayClock@email"), mock(User.Accounts.class),
        mock(User.Conversations.class));
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    conversation = new Conversation("1", new ConversationDescription("title"), mock(Conversation.Messages.class));
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
        .body("_embedded.conversations[0].title", is(conversation.getDescription().title()))
        .body("_embedded.conversations[0]._links.self.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity()))
        .body("_embedded.conversations[0]._links.messages.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages"))
        .body("_embedded.conversations[0]._links.messages.type", is(HttpMethod.GET))
        .body("_embedded.conversations[0]._links.save-message.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/messages"))
        .body("_embedded.conversations[0]._links.save-message.type", is(HttpMethod.POST));

  }

  @Test
  public void should_create_new_conversation() {
    ConversationDescription description = new ConversationDescription("New Conversation");
    Conversation newConversation = new Conversation("2", description, mock(Conversation.Messages.class));
    when(user.add(any(ConversationDescription.class))).thenReturn(newConversation);

    given().accept(MediaTypes.HAL_JSON.toString())
        .contentType(MediaType.APPLICATION_JSON)
        .body(description)
        .when().post("/users/" + user.getIdentity() + "/conversations")
        .then().statusCode(201)
        .header(HttpHeaders.LOCATION,
            is(uri("/api/users/" + user.getIdentity() + "/conversations/" + newConversation.getIdentity())));
  }

  @Test
  public void should_send_message_and_receive_streaming_response() {
    String testMessage = "Hello";
    String expectedResponse1 = "response1";
    String expectedResponse2 = "response2";
    String expectedResponse3 = "response3";
    when(user.conversations().findByIdentity(conversation.getIdentity())).thenReturn(Optional.of(conversation));
    when(conversation.sendMessage(any()))
        .thenReturn(Flux.just(expectedResponse1, expectedResponse2, expectedResponse3));

    given()
        .accept(MediaType.SERVER_SENT_EVENTS)
        .queryParam("message", testMessage)
        .when().get("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity() + "/chat")
        .then().statusCode(200);
  }
}
