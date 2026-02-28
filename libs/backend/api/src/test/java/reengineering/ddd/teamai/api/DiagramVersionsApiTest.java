package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription;
import reengineering.ddd.teamai.description.DiagramVersionDescription.DiagramSnapshot;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Diagram.Type;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.model.Project;

public class DiagramVersionsApiTest extends ApiTest {
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
  void beforeEach() {
    project =
        new Project(
            "project-1",
            new ProjectDescription("Test Project"),
            projectMembers,
            projectConversations,
            projectLogicalEntities,
            diagrams);

    Viewport viewport = new Viewport(100, 50, 1.5);
    diagram =
        new Diagram(
            "diagram-1",
            new DiagramDescription("下单流程上下文图", Type.CLASS, viewport),
            diagramNodes,
            diagramEdges,
            diagramVersions);

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(diagrams.findByIdentity(diagram.getIdentity())).thenReturn(Optional.of(diagram));
  }

  @Test
  void should_return_versions_of_diagram() {
    DiagramVersion version1 =
        new DiagramVersion(
            "version-1",
            new DiagramVersionDescription(
                "v1", new DiagramSnapshot(List.of(), List.of(), Viewport.defaultViewport())));
    DiagramVersion version2 =
        new DiagramVersion(
            "version-2",
            new DiagramVersionDescription(
                "v2", new DiagramSnapshot(List.of(), List.of(), new Viewport(10, 20, 1.2))));

    when(diagramVersions.findAll()).thenReturn(new EntityList<>(version1, version2));

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON_VALUE)
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/versions",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.versions", hasSize(2))
        .body("_embedded.versions[0].id", is("version-1"))
        .body("_embedded.versions[0].name", is("v1"))
        .body("_embedded.versions[1].id", is("version-2"))
        .body("_embedded.versions[1].name", is("v2"))
        .body(
            "_links.self.href",
            endsWith(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/versions"));
  }

  @Test
  void should_return_single_version() {
    DiagramVersion version =
        new DiagramVersion(
            "version-1",
            new DiagramVersionDescription(
                "v1", new DiagramSnapshot(List.of(), List.of(), new Viewport(10, 20, 1.2))));
    when(diagramVersions.findByIdentity(version.getIdentity())).thenReturn(Optional.of(version));

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON_VALUE)
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/versions/{versionId}",
            project.getIdentity(),
            diagram.getIdentity(),
            version.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is("version-1"))
        .body("name", is("v1"))
        .body("snapshot.viewport.x", is(10.0F))
        .body("snapshot.viewport.y", is(20.0F))
        .body("snapshot.viewport.zoom", is(1.2F))
        .body(
            "_links.diagram.href",
            is("/api/projects/" + project.getIdentity() + "/diagrams/" + diagram.getIdentity()))
        .body(
            "_links.collection.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/versions"));
  }

  @Test
  void should_create_version() {
    when(diagramNodes.findAll()).thenReturn(new EntityList<>());
    when(diagramEdges.findAll()).thenReturn(new EntityList<>());
    when(diagramVersions.findAll()).thenReturn(new EntityList<>());

    DiagramVersion created =
        new DiagramVersion(
            "version-1",
            new DiagramVersionDescription(
                "v1", new DiagramSnapshot(List.of(), List.of(), new Viewport(100, 50, 1.5))));
    when(diagramVersions.add(any())).thenReturn(created);

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON_VALUE)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{diagramId}/versions",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is("version-1"))
        .body("name", is("v1"))
        .body("snapshot.viewport.x", is(100.0F))
        .body("snapshot.viewport.y", is(50.0F))
        .body("snapshot.viewport.zoom", is(1.5F))
        .header(
            "Location",
            containsString(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/versions/"
                    + created.getIdentity()));

    ArgumentCaptor<DiagramVersionDescription> captor =
        ArgumentCaptor.forClass(DiagramVersionDescription.class);
    verify(diagramVersions, times(1)).add(captor.capture());
    DiagramVersionDescription request = captor.getValue();
    assertNotNull(request);
    assertEquals("v1", request.name());
    assertEquals(100, request.snapshot().viewport().x());
    assertEquals(50, request.snapshot().viewport().y());
    assertEquals(1.5, request.snapshot().viewport().zoom());
  }

  @Test
  void should_return_404_when_version_not_found() {
    when(diagramVersions.findByIdentity("missing-version")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON_VALUE)
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/versions/{versionId}",
            project.getIdentity(),
            diagram.getIdentity(),
            "missing-version")
        .then()
        .statusCode(404);
  }
}
