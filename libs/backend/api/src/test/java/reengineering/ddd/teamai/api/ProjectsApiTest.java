package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.bizDiagramsLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.conversationsLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.selfLink;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class ProjectsApiTest extends ApiTest {
  @MockitoBean private Users users;
  private User user;
  private Project project;

  @Mock private User.Projects userProjects;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.BizDiagrams projectBizDiagrams;

  @BeforeEach
  public void beforeEach() {
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
            projectConversations,
            projectBizDiagrams);
    when(users.findById(user.getIdentity())).thenReturn(Optional.of(user));
    when(userProjects.findAll()).thenReturn(new EntityList<>(project));
    when(userProjects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
  }

  @Test
  public void should_return_project_with_biz_diagrams_link() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "projects/get-project",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user"),
                    parameterWithName("projectId").description("Unique identifier of the project")),
                halLinksSnippet(selfLink(), conversationsLink(), bizDiagramsLink())))
        .when()
        .get("/users/{userId}/projects/{projectId}", user.getIdentity(), project.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.PROJECT))
        .body("id", is(project.getIdentity()))
        .body("name", is(project.getDescription().name()))
        .body("domainModel", is(project.getDescription().domainModel()))
        .body(
            "_links.self.href",
            is("/api/users/" + user.getIdentity() + "/projects/" + project.getIdentity()))
        .body(
            "_links.conversations.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/conversations"))
        .body(
            "_links.biz-diagrams.href",
            is(
                "/api/users/"
                    + user.getIdentity()
                    + "/projects/"
                    + project.getIdentity()
                    + "/biz-diagrams"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(2))
        .body("_templates.delete-project.method", is("DELETE"))
        .body("_templates.create-conversation.method", is("POST"))
        .body("_templates.create-conversation.properties", hasSize(1))
        .body("_templates.create-biz-diagram.method", is("POST"))
        .body("_templates.create-biz-diagram.properties", hasSize(4));
  }

  @Test
  public void should_return_diagram_type_options() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/users/{userId}/projects/{projectId}", user.getIdentity(), project.getIdentity())
        .then()
        .statusCode(200)
        .body("_templates.'create-biz-diagram'.properties[1].name", is("diagramType"))
        .body("_templates.'create-biz-diagram'.properties[1].options.inline", hasSize(6))
        .body(
            "_templates.'create-biz-diagram'.properties[1].options.inline.value",
            org.hamcrest.Matchers.containsInAnyOrder(
                "flowchart", "sequence", "class", "component", "state", "activity"))
        .body("_templates.'create-biz-diagram'.properties[1].options.minItems", is(1))
        .body("_templates.'create-biz-diagram'.properties[1].options.maxItems", is(1));
  }
}
