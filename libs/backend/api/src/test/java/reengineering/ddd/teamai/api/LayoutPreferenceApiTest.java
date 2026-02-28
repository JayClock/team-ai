package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Project;

public class LayoutPreferenceApiTest extends ApiTest {
  private Project project;
  private Diagram diagram;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities projectLogicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Diagram.Nodes diagramNodes;
  @Mock private Diagram.Edges diagramEdges;
  @Mock private Diagram.Versions diagramVersions;

  @BeforeEach
  public void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project"),
            projectMembers,
            projectConversations,
            projectLogicalEntities,
            diagrams);

    diagram =
        new Diagram(
            "diagram-1",
            new DiagramDescription("Test Diagram", Diagram.Type.CLASS, new Viewport(0, 0, 1)),
            diagramNodes,
            diagramEdges,
            diagramVersions);

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(diagrams.findByIdentity(diagram.getIdentity())).thenReturn(Optional.of(diagram));
    when(diagramNodes.findAll()).thenReturn(new EntityList<>());
    when(diagramEdges.findAll()).thenReturn(new EntityList<>());
  }

  @Test
  public void should_embed_sidebar_for_project_when_prefer_layout_sidebar() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .header("Prefer", "layout=sidebar")
        .when()
        .get("/projects/{projectId}", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.sidebar.sections", hasSize(1))
        .body("_embedded.sidebar.sections[0].title", is("PROJECT"))
        .body(
            "_embedded.sidebar.sections[0].items[0].path",
            is("/api/projects/" + project.getIdentity() + "/diagrams"))
        .body(
            "_embedded.sidebar.sections[0].items[1].path",
            is("/api/projects/" + project.getIdentity() + "/conversations"))
        .body(
            "_embedded.sidebar._links.self.href",
            is("/api/projects/" + project.getIdentity() + "/sidebar"))
        .body("_links.sidebar.href", is("/api/projects/" + project.getIdentity() + "/sidebar"));
  }

  @Test
  public void should_embed_sidebar_for_diagram_when_prefer_layout_sidebar() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .header("Prefer", "layout=sidebar")
        .when()
        .get("/projects/{projectId}/diagrams/{id}", project.getIdentity(), diagram.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.sidebar.sections", hasSize(1))
        .body("_embedded.sidebar.sections[0].title", is("PROJECT"))
        .body(
            "_embedded.sidebar.sections[0].items[0].path",
            is("/api/projects/" + project.getIdentity() + "/diagrams"))
        .body(
            "_embedded.sidebar.sections[0].items[1].path",
            is("/api/projects/" + project.getIdentity() + "/conversations"))
        .body(
            "_embedded.sidebar._links.self.href",
            is("/api/projects/" + project.getIdentity() + "/sidebar"))
        .body("_links.sidebar.href", is("/api/projects/" + project.getIdentity() + "/sidebar"));
  }

  @Test
  public void should_not_embed_sidebar_when_prefer_not_set() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}", project.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.sidebar", nullValue())
        .body("_links.sidebar", nullValue());
  }

  @Test
  public void should_return_400_when_prefer_layout_is_unsupported() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .header("Prefer", "layout=unknown")
        .when()
        .get("/projects/{projectId}", project.getIdentity())
        .then()
        .statusCode(400);
  }
}
