package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.restdocs.headers.HeaderDocumentation.headerWithName;
import static org.springframework.restdocs.headers.HeaderDocumentation.responseHeaders;
import static org.springframework.restdocs.payload.PayloadDocumentation.requestFields;
import static org.springframework.restdocs.payload.PayloadDocumentation.responseFields;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.pathParameters;
import static org.springframework.restdocs.restassured.RestAssuredRestDocumentation.document;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.bizDiagramResponseFields;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.createBizDiagramRequestFields;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.halLinksSnippet;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.pagedBizDiagramsResponseFields;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.paginationLinks;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.paginationParameters;
import static reengineering.ddd.teamai.api.docs.HateoasDocumentation.selfLink;

import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.apache.http.HttpHeaders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.stubbing.Answer;
import org.springframework.hateoas.MediaTypes;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reengineering.ddd.archtype.Many;
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

public class BizDiagramsApiTest extends ApiTest {
  @MockitoBean private Users users;
  private User user;
  private Project project;

  @Mock private Many<BizDiagram> bizDiagrams;
  @Mock private Project.BizDiagrams projectBizDiagrams;
  private BizDiagram diagram;

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
            mock(Project.Conversations.class),
            projectBizDiagrams);
    when(users.findById(user.getIdentity())).thenReturn(Optional.ofNullable(user));
    when(userProjects.findAll()).thenReturn(new EntityList<>(project));
    when(userProjects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    diagram =
        new BizDiagram(
            "1",
            new BizDiagramDescription(
                "Order Process", "Customer order workflow", "@startuml\n@enduml", "sequence"));
    when(projectBizDiagrams.findByIdentity(diagram.getIdentity())).thenReturn(Optional.of(diagram));
  }

  @Test
  public void should_return_all_biz_diagrams_of_project_as_pages() {
    when(projectBizDiagrams.findAll()).thenReturn(bizDiagrams);
    when(bizDiagrams.size()).thenReturn(400);
    when(bizDiagrams.subCollection(eq(0), eq(40))).thenReturn(new EntityList<>(diagram));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "biz-diagrams/list-paginated",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of user"),
                    parameterWithName("projectId").description("Unique identifier of project")),
                paginationParameters(),
                responseFields(pagedBizDiagramsResponseFields()),
                paginationLinks()))
        .when()
        .get(
            "/users/{userId}/projects/{projectId}/biz-diagrams",
            user.getIdentity(),
            project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.bizDiagrams", hasSize(1))
        .body("_links.self.href", is(not(nullValue())));
  }

  @Test
  public void should_create_biz_diagram() {
    BizDiagram.BizDiagramChange request = new BizDiagram.BizDiagramChange();
    request.setName("Payment Flow");
    request.setDescription("Credit card payment process");
    request.setPlantumlCode("@startuml\n@enduml");
    request.setDiagramType("flowchart");

    Answer<BizDiagram> answer =
        invocation -> {
          BizDiagramDescription description = invocation.getArgument(0);
          return new BizDiagram("1", description);
        };
    when(projectBizDiagrams.add(any(BizDiagramDescription.class))).thenAnswer(answer);

    given(documentationSpec)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .filter(
            document(
                "biz-diagrams/create",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of user"),
                    parameterWithName("projectId").description("Unique identifier of project")),
                requestFields(createBizDiagramRequestFields()),
                responseFields(bizDiagramResponseFields()),
                responseHeaders(
                    headerWithName(HttpHeaders.LOCATION)
                        .description("Location header for the created resource"))))
        .when()
        .post(
            "/users/{userId}/projects/{projectId}/biz-diagrams",
            user.getIdentity(),
            project.getIdentity())
        .then()
        .statusCode(201)
        .body("name", equalTo("Payment Flow"))
        .header(
            HttpHeaders.LOCATION,
            containsString("/users/JayClock/projects/project-1/biz-diagrams/1"));
  }

  @Test
  public void should_return_biz_diagram_by_id() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .filter(
            document(
                "biz-diagrams/get-by-id",
                pathParameters(
                    parameterWithName("userId").description("Unique identifier of user"),
                    parameterWithName("projectId").description("Unique identifier of project"),
                    parameterWithName("diagramId").description("Unique identifier of diagram")),
                responseFields(bizDiagramResponseFields()),
                halLinksSnippet(selfLink())))
        .when()
        .get(
            "/users/{userId}/projects/{projectId}/biz-diagrams/{diagramId}",
            user.getIdentity(),
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(200)
        .body("id", equalTo(diagram.getIdentity()))
        .body("name", equalTo(diagram.getDescription().name()));
  }

  @Test
  public void should_delete_biz_diagram() {
    given(documentationSpec)
        .when()
        .delete(
            "/users/{userId}/projects/{projectId}/biz-diagrams/{diagramId}",
            user.getIdentity(),
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(204);

    verify(projectBizDiagrams).delete(diagram.getIdentity());
  }
}
