package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.Project;

public class DiagramsApiTest extends ApiTest {
  private Project project;
  private Diagram diagram;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities projectLogicalEntities;
  @Mock private Project.Diagrams diagrams;

  @BeforeEach
  public void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project", "domain-model"),
            projectMembers,
            projectConversations,
            projectLogicalEntities,
            diagrams);

    Viewport viewport = new Viewport(100, 50, 1.5);
    diagram =
        new Diagram(
            "diagram-1",
            project.getIdentity(),
            new DiagramDescription(
                "下单流程上下文图",
                DiagramType.CLASS,
                viewport,
                new reengineering.ddd.archtype.Ref<>(project.getIdentity())));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(diagrams.findByIdentity(diagram.getIdentity())).thenReturn(Optional.of(diagram));
  }

  @Test
  public void should_return_single_diagram() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/diagrams/{id}", project.getIdentity(), diagram.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(diagram.getIdentity()))
        .body("title", is(diagram.getDescription().title()))
        .body("type", is("class"))
        .body("viewport.x", is(100.0F))
        .body("viewport.y", is(50.0F))
        .body("viewport.zoom", is(1.5F))
        .body(
            "_links.self.href",
            is("/api/projects/" + project.getIdentity() + "/diagrams/" + diagram.getIdentity()))
        .body("_links.diagrams.href", is("/api/projects/" + project.getIdentity() + "/diagrams"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(4))
        .body("_templates.delete-diagram.method", is("DELETE"));

    verify(diagrams, times(1)).findByIdentity(diagram.getIdentity());
  }

  @Test
  public void should_return_404_when_getting_non_existent_diagram() {
    when(diagrams.findByIdentity("non-existent")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .get("/projects/{projectId}/diagrams/{id}", project.getIdentity(), "non-existent")
        .then()
        .statusCode(404);
  }
}
