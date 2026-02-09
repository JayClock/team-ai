package com.businessdrivenai.api;

import static com.businessdrivenai.api.docs.HateoasDocumentation.*;
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

import com.businessdrivenai.domain.description.ConversationDescription;
import com.businessdrivenai.domain.description.MessageDescription;
import com.businessdrivenai.domain.model.Conversation;
import com.businessdrivenai.domain.model.Message;
import com.businessdrivenai.domain.model.Project;
import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.core.publisher.Flux;

public class MessagesApiTest extends ApiTest {
  @MockitoBean private Conversation.ModelProvider modelProvider;

  private Project project;
  private Conversation conversation;
  private Conversation.Messages messages;

  @BeforeEach
  public void beforeEach() {
    messages = mock(Conversation.Messages.class);
    Project.Members projectMembers = mock(Project.Members.class);
    Project.Conversations projectConversations = mock(Project.Conversations.class);
    Project.LogicalEntities logicalEntities = mock(Project.LogicalEntities.class);
    Project.Diagrams diagrams = mock(Project.Diagrams.class);

    project =
        new Project(
            "project-1",
            mock(com.businessdrivenai.domain.description.ProjectDescription.class),
            projectMembers,
            projectConversations,
            logicalEntities,
            diagrams);
    conversation = new Conversation("1", new ConversationDescription("title"), messages);
    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.ofNullable(project));
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
                    parameterWithName("projectId").description("Unique identifier of the project"),
                    parameterWithName("conversationId")
                        .description("Unique identifier of the conversation")),
                responseFields(messagesCollectionResponseFields())))
        .when()
        .get(
            "/projects/{projectId}/conversations/{conversationId}/messages",
            project.getIdentity(),
            conversation.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.messages.size()", is(2))
        .body("_embedded.messages[0].id", is(message.getIdentity()))
        .body("_embedded.messages[0].role", is(message.getDescription().role()))
        .body("_embedded.messages[0].content", is(message.getDescription().content()))
        .body(
            "_embedded.messages[0]._links.self.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/"
                    + message.getIdentity()))
        .body("_embedded.messages[1].id", is(message2.getIdentity()))
        .body("_embedded.messages[1].role", is(message2.getDescription().role()))
        .body("_embedded.messages[1].content", is(message2.getDescription().content()))
        .body(
            "_embedded.messages[1]._links.self.href",
            is(
                "/api/projects/"
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
                        parameterWithName("projectId")
                            .description("Unique identifier of the project"),
                        parameterWithName("conversationId")
                            .description("Unique identifier of the conversation")),
                    requestFields(sendMessageRequestFields())))
            .body(userDescription)
            .when()
            .post(
                "/projects/{projectId}/conversations/{conversationId}/messages/stream",
                project.getIdentity(),
                conversation.getIdentity())
            .then()
            .statusCode(200)
            .extract()
            .asString();

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
