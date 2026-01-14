package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.apache.http.HttpHeaders;
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

public class ConversationsApiTest extends ApiTest {
  @MockitoBean private Users users;
  @MockitoBean private Conversation.ModelProvider modelProvider;
  private User user;

  @Mock private Many<Conversation> conversations;
  @Mock private User.Conversations userConversations;
  private Conversation conversation;

  @BeforeEach
  public void beforeEach() {
    user =
        new User(
            "JayClock",
            new UserDescription("JayClock", "JayClock@email"),
            mock(User.Accounts.class),
            userConversations);
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    conversation =
        new Conversation(
            "1", new ConversationDescription("title"), mock(Conversation.Messages.class));
    when(userConversations.findByIdentity(conversation.getIdentity()))
        .thenReturn(Optional.of(conversation));
  }

  @Test
  public void should_return_all_conversations_of_user_as_pages() {
    when(userConversations.findAll()).thenReturn(conversations);
    when(conversations.size()).thenReturn(400);
    when(conversations.subCollection(eq(0), eq(40))).thenReturn(new EntityList<>(conversation));

    given()
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/users/" + user.getIdentity() + "/conversations")
        .then()
        .statusCode(200)
        .body("_links.self.href", is("/api/users/" + user.getIdentity() + "/conversations?page=0"))
        .body("_links.next.href", is("/api/users/" + user.getIdentity() + "/conversations?page=1"))
        .body("_embedded.conversations.size()", is(1))
        .body("_embedded.conversations[0].id", is(conversation.getIdentity()))
        .body("_embedded.conversations[0].title", is(conversation.getDescription().title()))
        .body(
            "_embedded.conversations[0]._links.self.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity()))
        .body(
            "_embedded.conversations[0]._links.messages.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages"))
        .body(
            "_embedded.conversations[0]._links.send-message.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_embedded.conversations[0]._templates.default.method", is("PUT"))
        .body("_embedded.conversations[0]._templates.default.properties", hasSize(1))
        .body("_embedded.conversations[0]._templates.send-message.method", is("POST"))
        .body(
            "_embedded.conversations[0]._templates.send-message.target",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_embedded.conversations[0]._templates.send-message.properties", hasSize(2))
        .body(
            "_embedded.conversations[0]._links.delete-conversation.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity()))
        .body("_embedded.conversations[0]._templates.delete-conversation.method", is("DELETE"));
  }

  @Test
  public void should_create_new_conversation() {
    ConversationDescription description = new ConversationDescription("New Conversation");
    Conversation newConversation =
        new Conversation("2", description, mock(Conversation.Messages.class));
    when(user.add(any(ConversationDescription.class))).thenReturn(newConversation);

    given()
        .accept(MediaTypes.HAL_JSON.toString())
        .contentType(MediaType.APPLICATION_JSON)
        .body(description)
        .when()
        .post("/users/" + user.getIdentity() + "/conversations")
        .then()
        .statusCode(201)
        .header(
            HttpHeaders.LOCATION,
            is(
                uri(
                    "/api/users/"
                        + user.getIdentity()
                        + "/conversations/"
                        + newConversation.getIdentity())))
        .body("id", is(newConversation.getIdentity()));
  }

  @Test
  public void should_return_single_conversation() {
    when(userConversations.findByIdentity(conversation.getIdentity()))
        .thenReturn(Optional.of(conversation));

    given()
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(conversation.getIdentity()))
        .body("title", is(conversation.getDescription().title()))
        .body(
            "_links.self.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity()))
        .body(
            "_links.messages.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages"))
        // send-message link with Template
        .body(
            "_links.send-message.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(1))
        .body("_templates.send-message.method", is("POST"))
        .body(
            "_templates.send-message.target",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_templates.send-message.properties", hasSize(2))
        // delete link with Template
        .body(
            "_links.delete-conversation.href",
            is("/api/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity()))
        .body("_templates.delete-conversation.method", is("DELETE"));

    verify(userConversations, times(1)).findByIdentity(conversation.getIdentity());
  }

  @Test
  public void should_delete_conversation() {
    when(userConversations.findByIdentity(conversation.getIdentity()))
        .thenReturn(Optional.of(conversation));

    given()
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .delete("/users/" + user.getIdentity() + "/conversations/" + conversation.getIdentity())
        .then()
        .statusCode(204);

    verify(userConversations).delete(conversation.getIdentity());
  }

  @Test
  public void should_return_404_when_deleting_non_existent_conversation() {
    when(userConversations.findByIdentity("non-existent")).thenReturn(Optional.empty());

    given()
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .delete("/users/" + user.getIdentity() + "/conversations/non-existent")
        .then()
        .statusCode(404);
  }
}
