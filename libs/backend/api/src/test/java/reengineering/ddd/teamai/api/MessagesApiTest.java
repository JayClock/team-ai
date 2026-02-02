package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.payload.PayloadDocumentation.requestFields;
import static org.springframework.restdocs.payload.PayloadDocumentation.responseFields;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.*;

import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.core.publisher.Flux;
import reengineering.ddd.teamai.description.ConversationDescription;
import reengineering.ddd.teamai.description.MessageDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Message;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class MessagesApiTest extends ApiTest {
  @MockitoBean private Users users;
  @MockitoBean private Conversation.ModelProvider modelProvider;

  private User user;
  private Project project;
  private Conversation conversation;
  private Conversation.Messages messages;

  @BeforeEach
  public void beforeEach() {
    User.Projects userProjects = mock(User.Projects.class);
    user =
        new User(
            "JayClock",
            new UserDescription("JayClock", "JayClock@email"),
            mock(User.Accounts.class),
            userProjects);
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    messages = mock(Conversation.Messages.class);
    Project.Members projectMembers = mock(Project.Members.class);
    Project.Conversations projectConversations = mock(Project.Conversations.class);
    project =
        new Project(
            "project-1",
            mock(reengineering.ddd.teamai.description.ProjectDescription.class),
            projectMembers,
            projectConversations);
    conversation = new Conversation("1", new ConversationDescription("title"), messages);
    when(userProjects.findAll()).thenReturn(new EntityList<>(project));
    when(userProjects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(projectConversations.findByIdentity(conversation.getIdentity()))
        .thenReturn(Optional.ofNullable(conversation));
  }

  @Test
  public void should_return_all_messages_of_conversation() {
    MessageDescription description = new MessageDescription("user", "content");
    Message message = new Message("1", description);
    Message message2 = new Message("2", new MessageDescription("assistant", "response"));

    when(messages.findAll()).thenReturn(new EntityList<>(message, message2));

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .filter(
            document(
                "messages/list",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"),
                    parameterWithName("projectId").description("Unique identifier of the project"),
                    parameterWithName("conversationId")
                        .description("Unique identifier of the conversation")),
                responseFields(messagesCollectionResponseFields())))
        .when()
        .get(
            "/users/{userId}/projects/{projectId}/conversations/{conversationId}/messages",
            user.getIdentity(),
            project.getIdentity(),
            conversation.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.messages.size()", is(2))
        .body("_embedded.messages[0].id", is(message.getIdentity()))
        .body("_embedded.messages[0].role", is(message.getDescription().role()))
        .body("_embedded.messages[0].content", is(message.getDescription().content()))
        // MessageModel should have self link
        .body(
            "_embedded.messages[0]._links.self.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/"
                    + message.getIdentity()))
        .body("_embedded.messages[1].id", is(message2.getIdentity()))
        .body("_embedded.messages[1].role", is(message2.getDescription().role()))
        .body("_embedded.messages[1].content", is(message2.getDescription().content()))
        // MessageModel should have self link
        .body(
            "_embedded.messages[1]._links.self.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/"
                    + message2.getIdentity()));

    verify(messages).findAll();
  }

  @Test
  public void should_send_message_and_receive_streaming_response_in_vercel_ai_sdk_format() {
    MessageDescription userDescription = new MessageDescription("user", "Hello, AI!");
    Message savedMessage = new Message("1", userDescription);
    MessageDescription assistantDescription =
        new MessageDescription("assistant", "Hello there! How can I help you?");
    Message assistantMessage = new Message("2", assistantDescription);

    when(messages.saveMessage(any(MessageDescription.class)))
        .thenReturn(savedMessage)
        .thenReturn(assistantMessage);

    when(modelProvider.sendMessage(eq("Hello, AI!"), any(String.class)))
        .thenReturn(Flux.just("Hello", " there", "!", " How", " can", " I", " help", " you", "?"));

    String responseBody =
        given(documentationSpec)
            .urlEncodingEnabled(false)
            .accept(MediaType.SERVER_SENT_EVENTS)
            .contentType(MediaType.APPLICATION_JSON)
            .header("X-Api-Key", "test-api-key")
            .filter(
                document(
                    "messages/send-stream",
                    pathParameters(
                        parameterWithName("userId").description("Unique identifier of the user"),
                        parameterWithName("projectId")
                            .description("Unique identifier of the project"),
                        parameterWithName("conversationId")
                            .description("Unique identifier of the conversation")),
                    requestFields(sendMessageRequestFields())))
            .body(userDescription)
            .when()
            .post(
                "/users/{userId}/projects/{projectId}/conversations/{conversationId}/messages/stream",
                user.getIdentity(),
                project.getIdentity(),
                conversation.getIdentity())
            .then()
            .statusCode(200)
            .extract()
            .asString();

    // Verify Vercel AI SDK Data Stream Protocol format
    assertThat(responseBody).contains("\"type\":\"start\"");
    assertThat(responseBody).contains("\"type\":\"text-start\"");
    assertThat(responseBody).contains("\"type\":\"text-delta\"");
    assertThat(responseBody).contains("\"delta\":\"Hello\"");
    assertThat(responseBody).contains("\"type\":\"text-end\"");
    assertThat(responseBody).contains("\"type\":\"finish\"");
    assertThat(responseBody).contains("[DONE]");

    verify(messages).saveMessage(eq(userDescription));
    verify(messages).saveMessage(eq(assistantDescription));
  }
}
