package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.EdgeStyleProps;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.Project;

public class EdgesApiTest extends ApiTest {
  private Project project;
  private Diagram diagram;
  private DiagramEdge edge;

  @Mock private Project.Members projectMembers;
  @Mock private Project.Conversations projectConversations;
  @Mock private Project.LogicalEntities projectLogicalEntities;
  @Mock private Project.Diagrams diagrams;
  @Mock private Diagram.Nodes diagramNodes;
  @Mock private Diagram.Edges diagramEdges;

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

    Viewport viewport = new Viewport(100, 50, 1.5);
    diagram =
        new Diagram(
            "diagram-1",
            project.getIdentity(),
            new DiagramDescription("下单流程上下文图", DiagramType.CLASS, viewport),
            diagramNodes,
            diagramEdges);

    EdgeStyleProps styleProps = new EdgeStyleProps("solid", "#333333", "arrow", 2);
    edge =
        new DiagramEdge(
            "edge-1",
            diagram.getIdentity(),
            new EdgeDescription(
                new Ref<>("node-1"),
                new Ref<>("node-2"),
                "bottom",
                "top",
                "ASSOCIATION",
                "hasMany",
                styleProps));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(diagrams.findByIdentity(diagram.getIdentity())).thenReturn(Optional.of(diagram));
    when(diagramEdges.findByIdentity(edge.getIdentity())).thenReturn(Optional.of(edge));
  }

  @Test
  public void should_return_single_edge() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/edges/{id}",
            project.getIdentity(),
            diagram.getIdentity(),
            edge.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(edge.getIdentity()))
        .body("sourceNodeId", is("node-1"))
        .body("targetNodeId", is("node-2"))
        .body("sourceHandle", is("bottom"))
        .body("targetHandle", is("top"))
        .body("relationType", is("ASSOCIATION"))
        .body("label", is("hasMany"))
        .body("styleProps.lineStyle", is("solid"))
        .body("styleProps.color", is("#333333"))
        .body("styleProps.arrowType", is("arrow"))
        .body("styleProps.lineWidth", is(2))
        .body(
            "_links.self.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/edges/"
                    + edge.getIdentity()))
        .body(
            "_links.edges.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/edges"))
        .body(
            "_links.diagram.href",
            is("/api/projects/" + project.getIdentity() + "/diagrams/" + diagram.getIdentity()))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.delete-edge.method", is("DELETE"))
        .body("_templates.create-edge.method", is("POST"))
        .body("_templates.create-edge.properties", hasSize(2))
        .body("_templates.create-edge.properties[0].name", is("sourceNodeId"))
        .body("_templates.create-edge.properties[0].required", is(true))
        .body("_templates.create-edge.properties[0].type", is("text"))
        .body("_templates.create-edge.properties[1].name", is("targetNodeId"))
        .body("_templates.create-edge.properties[1].required", is(true))
        .body("_templates.create-edge.properties[1].type", is("text"));

    verify(diagramEdges, times(1)).findByIdentity(edge.getIdentity());
  }

  @Test
  public void should_return_404_when_getting_non_existent_edge() {
    when(diagramEdges.findByIdentity("non-existent")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/edges/{id}",
            project.getIdentity(),
            diagram.getIdentity(),
            "non-existent")
        .then()
        .statusCode(404);
  }

  @Test
  public void should_return_404_when_diagram_not_found() {
    when(diagrams.findByIdentity("non-existent-diagram")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/edges/{id}",
            project.getIdentity(),
            "non-existent-diagram",
            edge.getIdentity())
        .then()
        .statusCode(404);
  }

  @Test
  public void should_create_edge() {
    EdgeStyleProps styleProps = new EdgeStyleProps("dashed", "#666666", "arrow", 1);
    DiagramEdge newEdge =
        new DiagramEdge(
            "edge-new",
            diagram.getIdentity(),
            new EdgeDescription(
                new Ref<>("source-node-1"),
                new Ref<>("target-node-2"),
                "right",
                "left",
                "DEPENDENCY",
                "dependsOn",
                styleProps));

    when(diagramEdges.add(any(EdgeDescription.class))).thenReturn(newEdge);

    EdgesApi.CreateEdgeRequest request = new EdgesApi.CreateEdgeRequest();
    request.setSourceNodeId("source-node-1");
    request.setTargetNodeId("target-node-2");

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{diagramId}/edges",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is(newEdge.getIdentity()))
        .body("sourceNodeId", is("source-node-1"))
        .body("targetNodeId", is("target-node-2"))
        .body("relationType", is("DEPENDENCY"))
        .body("label", is("dependsOn"))
        .body("styleProps.lineStyle", is("dashed"))
        .body("styleProps.color", is("#666666"))
        .body("styleProps.arrowType", is("arrow"))
        .body("styleProps.lineWidth", is(1));

    verify(diagramEdges, times(1)).add(any(EdgeDescription.class));
  }

  @Test
  public void should_return_all_edges() {
    EdgeStyleProps styleProps2 = new EdgeStyleProps("dashed", "#666666", "diamond", 1);
    DiagramEdge edge2 =
        new DiagramEdge(
            "edge-2",
            diagram.getIdentity(),
            new EdgeDescription(
                new Ref<>("node-3"),
                new Ref<>("node-4"),
                "left",
                "right",
                "AGGREGATION",
                "hasOne",
                styleProps2));

    when(diagramEdges.findAll()).thenReturn(new EntityList<>(edge, edge2));

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/edges",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded.edges", hasSize(2))
        .body("_embedded.edges[0].id", is(edge.getIdentity()))
        .body("_embedded.edges[0].relationType", is("ASSOCIATION"))
        .body("_embedded.edges[1].id", is(edge2.getIdentity()))
        .body("_embedded.edges[1].relationType", is("AGGREGATION"))
        .body(
            "_links.self.href",
            org.hamcrest.Matchers.endsWith(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/edges"));

    verify(diagramEdges, times(1)).findAll();
  }

  @Test
  public void should_return_empty_array_when_no_edges() {
    when(diagramEdges.findAll()).thenReturn(new EntityList<>());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/edges",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(200)
        .body("_embedded", org.hamcrest.Matchers.nullValue())
        .body("_links.self.href", org.hamcrest.Matchers.endsWith("/edges"));

    verify(diagramEdges, times(1)).findAll();
  }
}
