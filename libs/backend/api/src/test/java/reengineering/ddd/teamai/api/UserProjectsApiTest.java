package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.payload.PayloadDocumentation.responseFields;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.projectsCollectionResponseFields;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.HasOne;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.LocalCredential;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

public class UserProjectsApiTest extends ApiTest {
  private User user;
  private Project project1;
  private Project project2;

  @Mock private User.Accounts accounts;
  @Mock private HasOne<LocalCredential> credential;
  @Mock private User.Projects userProjects;
  @Mock private Project.Members members;
  @Mock private Project.Conversations conversations;
  @Mock private Project.LogicalEntities logicalEntities;
  @Mock private Project.Diagrams diagrams;

  @BeforeEach
  public void beforeEach() {
    user =
        new User(
            "JayClock",
            new UserDescription("JayClock", "jayclock@email.com"),
            accounts,
            credential,
            userProjects);

    project1 =
        new Project(
            "project-1",
            new ProjectDescription("Project One"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            null,
            null,
            null);
    project2 =
        new Project(
            "project-2",
            new ProjectDescription("Project Two"),
            members,
            conversations,
            logicalEntities,
            diagrams,
            null,
            null,
            null);

    when(users.findByIdentity(user.getIdentity())).thenReturn(Optional.of(user));
    when(userProjects.findAll()).thenReturn(new EntityList<>(List.of(project1, project2)));
  }

  @Test
  public void should_return_projects_for_user() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .filter(
            document(
                "user-projects/list",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of the user")),
                responseFields(projectsCollectionResponseFields())))
        .when()
        .get("/users/{userId}/projects", user.getIdentity())
        .then()
        .statusCode(200)
        .contentType(startsWith(ResourceTypes.PROJECT_COLLECTION))
        .body("_embedded.projects", hasSize(2))
        .body("_embedded.projects[0].id", is("project-1"))
        .body("_embedded.projects[0].name", is("Project One"))
        .body("_embedded.projects[0]._links.self.href", is("/api/projects/project-1"))
        .body("_embedded.projects[1].id", is("project-2"))
        .body("_embedded.projects[1].name", is("Project Two"))
        .body("_embedded.projects[1]._links.self.href", is("/api/projects/project-2"))
        .body("_links.self.href", is("/api/users/JayClock/projects"));

    verify(userProjects, times(1)).findAll();
  }
}
