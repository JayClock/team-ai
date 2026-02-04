package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.conversationsLink;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.selfLink;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.model.Project;

public class ProjectsApiTest extends ApiTest {
  private Project project;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities logicalEntities;

  @BeforeEach
  public void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project", "domain-model"),
            projectMembers,
            projectConversations,
            logicalEntities);
    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
  }

  @Test
  public void should_return_project_with_conversations_link() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "projects/get-project",
                pathParameters(
                    parameterWithName("projectId").description("Unique identifier of the project")),
                halLinksSnippet(selfLink(), conversationsLink())))
        .when()
        .get("/projects/{projectId}", project.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.PROJECT))
        .body("id", is(project.getIdentity()))
        .body("name", is(project.getDescription().name()))
        .body("domainModel", is(project.getDescription().domainModel()))
        .body("_links.self.href", is("/api/projects/" + project.getIdentity()))
        .body(
            "_links.conversations.href",
            is("/api/projects/" + project.getIdentity() + "/conversations"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(2))
        .body("_templates.delete-project.method", is("DELETE"))
        .body("_templates.create-conversation.method", is("POST"))
        .body("_templates.create-conversation.properties", hasSize(1));
  }
}
