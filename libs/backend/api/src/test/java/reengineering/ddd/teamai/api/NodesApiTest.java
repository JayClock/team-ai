package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LocalNodeData;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.NodeStyleConfig;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.Project;

public class NodesApiTest extends ApiTest {
  private Project project;
  private Diagram diagram;
  private DiagramNode node;

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

    NodeStyleConfig styleConfig = new NodeStyleConfig("#ffffff", "#000000", 14, false, List.of());
    LocalNodeData localData = new LocalNodeData("Note content", "#ffd93d", "sticky-note");
    node =
        new DiagramNode(
            "node-1",
            diagram.getIdentity(),
            new NodeDescription(
                "class-node",
                new Ref<>("logical-entity-1"),
                null,
                200.0,
                150.0,
                300,
                200,
                styleConfig,
                localData));

    when(projects.findByIdentity(project.getIdentity())).thenReturn(Optional.of(project));
    when(diagrams.findByIdentity(diagram.getIdentity())).thenReturn(Optional.of(diagram));
    when(diagramNodes.findByIdentity(node.getIdentity())).thenReturn(Optional.of(node));
  }

  @Test
  public void should_return_single_node() {
    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/nodes/{id}",
            project.getIdentity(),
            diagram.getIdentity(),
            node.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(node.getIdentity()))
        .body("type", is("class-node"))
        .body("logicalEntityId", is("logical-entity-1"))
        .body("positionX", is(200.0F))
        .body("positionY", is(150.0F))
        .body("width", is(300))
        .body("height", is(200))
        .body("styleConfig.backgroundColor", is("#ffffff"))
        .body("styleConfig.textColor", is("#000000"))
        .body("styleConfig.fontSize", is(14))
        .body("styleConfig.collapsed", is(false))
        .body("localData.content", is("Note content"))
        .body("localData.color", is("#ffd93d"))
        .body(
            "_links.self.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/nodes/"
                    + node.getIdentity()))
        .body(
            "_links.nodes.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/nodes"))
        .body(
            "_links.diagram.href",
            is("/api/projects/" + project.getIdentity() + "/diagrams/" + diagram.getIdentity()))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.delete-node.method", is("DELETE"))
        .body("_templates.create-node.method", is("POST"))
        .body("_templates.create-node.properties", hasSize(7))
        .body("_templates.create-node.properties[0].name", is("height"))
        .body("_templates.create-node.properties[0].required", is(true))
        .body("_templates.create-node.properties[0].type", is("number"))
        .body("_templates.create-node.properties[1].name", is("logicalEntityId"))
        .body("_templates.create-node.properties[1].type", is("text"))
        .body("_templates.create-node.properties[2].name", is("parentId"))
        .body("_templates.create-node.properties[2].type", is("text"))
        .body("_templates.create-node.properties[3].name", is("positionX"))
        .body("_templates.create-node.properties[3].type", is("number"))
        .body("_templates.create-node.properties[4].name", is("positionY"))
        .body("_templates.create-node.properties[4].type", is("number"))
        .body("_templates.create-node.properties[5].name", is("type"))
        .body("_templates.create-node.properties[5].required", is(true))
        .body("_templates.create-node.properties[5].type", is("text"))
        .body("_templates.create-node.properties[6].name", is("width"))
        .body("_templates.create-node.properties[6].required", is(true))
        .body("_templates.create-node.properties[6].type", is("number"))
        .body("_templates.create-edge.method", is("POST"))
        .body("_templates.create-edge.properties", hasSize(2))
        .body("_templates.create-edge.properties[0].name", is("sourceNodeId"))
        .body("_templates.create-edge.properties[0].required", is(true))
        .body("_templates.create-edge.properties[0].type", is("text"))
        .body("_templates.create-edge.properties[1].name", is("targetNodeId"))
        .body("_templates.create-edge.properties[1].required", is(true))
        .body("_templates.create-edge.properties[1].type", is("text"));

    verify(diagramNodes, times(1)).findByIdentity(node.getIdentity());
  }

  @Test
  public void should_return_404_when_getting_non_existent_node() {
    when(diagramNodes.findByIdentity("non-existent")).thenReturn(Optional.empty());

    given(documentationSpec)
        .accept(MediaTypes.HAL_JSON.toString())
        .when()
        .get(
            "/projects/{projectId}/diagrams/{diagramId}/nodes/{id}",
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
            "/projects/{projectId}/diagrams/{diagramId}/nodes/{id}",
            project.getIdentity(),
            "non-existent-diagram",
            node.getIdentity())
        .then()
        .statusCode(404);
  }

  @Test
  public void should_create_node() {
    DiagramNode newNode =
        new DiagramNode(
            "node-new",
            diagram.getIdentity(),
            new NodeDescription(
                "new-class-node",
                new Ref<>("new-logical-entity"),
                null,
                100.0,
                50.0,
                200,
                100,
                null,
                null));

    when(diagramNodes.add(any(NodeDescription.class))).thenReturn(newNode);

    NodesApi.CreateNodeRequest request = new NodesApi.CreateNodeRequest();
    request.setType("new-class-node");
    request.setLogicalEntityId("new-logical-entity");
    request.setParentId(null);
    request.setPositionX(100.0);
    request.setPositionY(50.0);
    request.setWidth(200);
    request.setHeight(100);

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{diagramId}/nodes",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(201)
        .body("id", is(newNode.getIdentity()))
        .body("type", is("new-class-node"))
        .body("logicalEntityId", is("new-logical-entity"))
        .body("positionX", is(100.0F))
        .body("positionY", is(50.0F))
        .body("width", is(200))
        .body("height", is(100));

    verify(diagramNodes, times(1)).add(any(NodeDescription.class));
  }
}
