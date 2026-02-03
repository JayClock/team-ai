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
import static org.springframework.restdocs.headers.HeaderDocumentation.headerWithName;
import static org.springframework.restdocs.headers.HeaderDocumentation.responseHeaders;
import static org.springframework.restdocs.payload.PayloadDocumentation.requestFields;
import static org.springframework.restdocs.payload.PayloadDocumentation.responseFields;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.conversationResponseFields;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.createConversationRequestFields;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.messagesLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.pagedConversationsResponseFields;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.paginationLinks;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.paginationParameters;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.selfLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.sendMessageLink;

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
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Conversation;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

public class ConversationsApiTest extends ApiTest {
  @MockitoBean private Conversation.ModelProvider modelProvider;
  private User user;
  private Project project;

  @Mock private Many<Conversation> conversations;
  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  private Conversation conversation;

  @BeforeEach
  public void beforeEach() {
    User.Projects userProjects = mock(User.Projects.class);
    user =
        new User(
            "JayClock",
            new UserDescription("JayClock", "JayClock@email"),
            mock(User.Accounts.class),
            userProjects);
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project", "domain-model"),
            projectMembers,
            projectConversations);
    when(users.findByIdentity(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    when(userProjects.findAll()).thenReturn(new EntityList<>(project));
    when(userProjects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    conversation =
        new Conversation(
            "1", new ConversationDescription("title"), mock(Conversation.Messages.class));
    when(projectConversations.findByIdentity(conversation.getIdentity()))
        .thenReturn(Optional.of(conversation));
  }

  @Test
  public void should_return_all_conversations_of_project_as_pages() {
    when(projectConversations.findAll()).thenReturn(conversations);
    when(conversations.size()).thenReturn(400);
    when(conversations.subCollection(eq(0), eq(40))).thenReturn(new EntityList<>(conversation));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "project-conversations/list-paginated",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"),
                    parameterWithName("projectId").description("Unique identifier of the project")),
                paginationParameters(),
                responseFields(pagedConversationsResponseFields()),
                paginationLinks()))
        .when()
        .get(
            "/users/{userId}/projects/{projectId}/conversations",
            user.getIdentity(),
            project.getIdentity())
        .then()
        .statusCode(200)
        .body(
            "_links.self.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations?page=0"))
        .body(
            "_links.next.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations?page=1"))
        .body("_embedded.conversations.size()", is(1))
        .body("_embedded.conversations[0].id", is(conversation.getIdentity()))
        .body("_embedded.conversations[0].title", is(conversation.getDescription().title()))
        .body(
            "_embedded.conversations[0]._links.self.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()))
        .body(
            "_embedded.conversations[0]._links.messages.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages"))
        .body(
            "_embedded.conversations[0]._links.chat.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_embedded.conversations[0]._templates.default.method", is("PUT"))
        .body("_embedded.conversations[0]._templates.default.properties", hasSize(1))
        .body("_embedded.conversations[0]._templates.chat.method", is("POST"))
        .body(
            "_embedded.conversations[0]._templates.chat.target",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_embedded.conversations[0]._templates.chat.properties", hasSize(2));
  }

  @Test
  public void should_create_new_conversation() {
    ConversationDescription description = new ConversationDescription("New Conversation");
    Conversation newConversation =
        new Conversation("2", description, mock(Conversation.Messages.class));
    when(project.add(any(ConversationDescription.class))).thenReturn(newConversation);

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .contentType(MediaType.APPLICATION_JSON)
        .filter(
            document(
                "project-conversations/create",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"),
                    parameterWithName("projectId").description("Unique identifier of the project")),
                requestFields(createConversationRequestFields()),
                responseFields(conversationResponseFields()),
                responseHeaders(
                    headerWithName("Location").description("URI of the created conversation"))))
        .body(description)
        .when()
        .post(
            "/users/{userId}/projects/{projectId}/conversations",
            user.getIdentity(),
            project.getIdentity())
        .then()
        .statusCode(201)
        .header(
            HttpHeaders.LOCATION,
            is(
                uri(
                    "/api/users/"
                        + user.getIdentity()
                        + "/projects/"
                        + project.getIdentity()
                        + "/conversations/"
                        + newConversation.getIdentity())))
        .body("id", is(newConversation.getIdentity()))
        .body("projectId", is(project.getIdentity()));
  }

  @Test
  public void should_return_single_conversation() {
    when(projectConversations.findByIdentity(conversation.getIdentity()))
        .thenReturn(Optional.of(conversation));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "project-conversations/get-single",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"),
                    parameterWithName("projectId").description("Unique identifier of the project"),
                    parameterWithName("conversationId")
                        .description("Unique identifier of the conversation")),
                responseFields(conversationResponseFields()),
                halLinksSnippet(selfLink(), messagesLink(), sendMessageLink())))
        .when()
        .get(
            "/users/{userId}/projects/{projectId}/conversations/{conversationId}",
            user.getIdentity(),
            project.getIdentity(),
            conversation.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(conversation.getIdentity()))
        .body("title", is(conversation.getDescription().title()))
        .body("projectId", is(project.getIdentity()))
        .body(
            "_links.self.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()))
        .body(
            "_links.messages.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages"))
        .body(
            "_links.chat.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(1))
        .body("_templates.chat.method", is("POST"))
        .body(
            "_templates.chat.target",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations/"
                    + conversation.getIdentity()
                    + "/messages/stream"))
        .body("_templates.chat.properties", hasSize(2));

    verify(projectConversations, times(1)).findByIdentity(conversation.getIdentity());
  }

  @Test
  public void should_delete_conversation() {
    when(projectConversations.findByIdentity(conversation.getIdentity()))
        .thenReturn(Optional.of(conversation));

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .filter(
            document(
                "project-conversations/delete",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"),
                    parameterWithName("projectId").description("Unique identifier of the project"),
                    parameterWithName("conversationId")
                        .description("Unique identifier of the conversation to delete"))))
        .when()
        .delete(
            "/users/{userId}/projects/{projectId}/conversations/{conversationId}",
            user.getIdentity(),
            project.getIdentity(),
            conversation.getIdentity())
        .then()
        .statusCode(204);

    verify(projectConversations).delete(conversation.getIdentity());
  }

  @Test
  public void should_return_404_when_deleting_non_existent_conversation() {
    when(projectConversations.findByIdentity("non-existent")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .filter(
            document(
                "project-conversations/delete-not-found",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"),
                    parameterWithName("projectId").description("Unique identifier of the project"),
                    parameterWithName("conversationId")
                        .description("Unique identifier of the conversation"))))
        .when()
        .delete(
            "/users/{userId}/projects/{projectId}/conversations/{conversationId}",
            user.getIdentity(),
            project.getIdentity(),
            "non-existent")
        .then()
        .statusCode(404);
  }
}
