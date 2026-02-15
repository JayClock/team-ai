package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.DiagramType;
import reengineering.ddd.teamai.model.LogicalEntity;
import reengineering.ddd.teamai.model.Project;

public class DiagramsApiTest extends ApiTest {
  private Project project;
  private Diagram diagram;

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
            new DiagramDescription("下单流程上下文图", DiagramType.CLASS, viewport),
            diagramNodes,
            diagramEdges);

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
        .body("_links.project.href", is("/api/projects/" + project.getIdentity()))
        .body(
            "_links.edges.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/edges"))
        .body(
            "_links.nodes.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/nodes"))
        .body(
            "_links.propose-model.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/propose-model"))
        .body(
            "_links.commit-draft.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/commit-draft"))
        .body("_templates.default.method", is("PUT"))
        .body("_templates.default.properties", hasSize(4))
        .body("_templates.default.properties[0].name", is("title"))
        .body("_templates.default.properties[0].required", is(true))
        .body("_templates.default.properties[0].type", is("text"))
        .body("_templates.default.properties[1].name", is("viewport.x"))
        .body("_templates.default.properties[1].type", is("number"))
        .body("_templates.default.properties[2].name", is("viewport.y"))
        .body("_templates.default.properties[2].type", is("number"))
        .body("_templates.default.properties[3].name", is("viewport.zoom"))
        .body("_templates.default.properties[3].type", is("number"))
        .body("_templates.delete-diagram.method", is("DELETE"))
        .body("_templates.delete-diagram.properties", hasSize(0))
        .body("_templates.create-node.method", is("POST"))
        .body("_templates.create-node.properties", hasSize(7))
        .body("_templates.create-node.properties[0].name", is("height"))
        .body("_templates.create-node.properties[0].required", is(true))
        .body("_templates.create-node.properties[0].type", is("number"))
        .body("_templates.create-node.properties[1].name", is("logicalEntity.id"))
        .body("_templates.create-node.properties[1].type", is("text"))
        .body(
            "_templates.create-node.properties[1].options.link.href",
            is("/api/projects/{projectId}/logical-entities"))
        .body("_templates.create-node.properties[1].options.promptField", is("name"))
        .body("_templates.create-node.properties[1].options.valueField", is("id"))
        .body("_templates.create-node.properties[2].name", is("parent.id"))
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
        .body("_templates.propose-model.method", is("POST"))
        .body("_templates.propose-model.properties", hasSize(1))
        .body("_templates.propose-model.properties[0].name", is("requirement"))
        .body("_templates.propose-model.properties[0].required", is(true))
        .body("_templates.propose-model.properties[0].type", is("text"))
        .body("_templates.'commit-draft'.method", is("POST"))
        .body(
            "_templates.'commit-draft'.properties.find { it.name == 'logicalEntities' }._schema.type",
            is("array"))
        .body(
            "_templates.'commit-draft'.properties.find { it.name == 'nodes' }._schema.type",
            is("array"))
        .body(
            "_templates.'commit-draft'.properties.find { it.name == 'edges' }._schema.type",
            is("array"))
        .body(
            "_templates.'commit-draft'.properties.find { it.name == 'nodes' }._schema.toString()",
            containsString("logicalEntity"))
        .body(
            "_templates.'commit-draft'.properties.find { it.name == 'nodes' }._schema.toString()",
            not(containsString("logicalEntity.id")))
        .body(
            "_templates.'commit-draft'.properties.find { it.name == 'edges' }._schema.toString()",
            containsString("sourceNode"))
        .body(
            "_templates.'commit-draft'.properties.find { it.name == 'edges' }._schema.toString()",
            containsString("targetNode"));

    verify(diagrams, times(1)).findByIdentity(diagram.getIdentity());
  }

  @Test
  public void should_batch_commit_nodes_and_edges() {
    DiagramNode createdNode1 =
        new DiagramNode(
            "node-101",
            new NodeDescription("fulfillment-node", null, null, 120, 120, 220, 120, null, null),
            mock(reengineering.ddd.archtype.HasOne.class));
    DiagramNode createdNode2 =
        new DiagramNode(
            "node-102",
            new NodeDescription("fulfillment-node", null, null, 420, 120, 220, 120, null, null),
            mock(reengineering.ddd.archtype.HasOne.class));
    DiagramEdge createdEdge =
        new DiagramEdge(
            "edge-201",
            new EdgeDescription(
                new Ref<>("node-101"),
                new Ref<>("node-102"),
                null,
                null,
                null,
                null,
                (JsonBlob) null));

    when(diagramNodes.add(any(NodeDescription.class))).thenReturn(createdNode1, createdNode2);
    when(diagramEdges.add(any(EdgeDescription.class))).thenReturn(createdEdge);

    NodesApi.CreateNodeRequest node1 = new NodesApi.CreateNodeRequest();
    node1.setType("fulfillment-node");
    node1.setPositionX(120);
    node1.setPositionY(120);
    node1.setWidth(220);
    node1.setHeight(120);

    NodesApi.CreateNodeRequest node2 = new NodesApi.CreateNodeRequest();
    node2.setType("fulfillment-node");
    node2.setPositionX(420);
    node2.setPositionY(120);
    node2.setWidth(220);
    node2.setHeight(120);

    EdgesApi.CreateEdgeRequest edge = new EdgesApi.CreateEdgeRequest();
    edge.setSourceNodeId("node-1");
    edge.setTargetNodeId("node-2");

    DiagramApi.CommitDraftRequest request = new DiagramApi.CommitDraftRequest();
    request.setNodes(List.of(node1, node2));
    request.setEdges(List.of(edge));

    given(documentationSpec)
        .accept(MediaType.APPLICATION_JSON)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{id}/commit-draft",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(201)
        .header(
            "Location",
            containsString(
                "/api/projects/" + project.getIdentity() + "/diagrams/" + diagram.getIdentity()));

    verify(diagramNodes, times(2)).add(any(NodeDescription.class));
    verify(diagramEdges, times(1)).add(any(EdgeDescription.class));
  }

  @Test
  public void should_batch_commit_logical_entities_and_resolve_placeholders() {
    LogicalEntity createdLogicalEntity =
        new LogicalEntity(
            "logical-101",
            new LogicalEntityDescription(
                LogicalEntityDescription.Type.EVIDENCE, null, "Order", "订单", null));
    DiagramNode createdNode =
        new DiagramNode(
            "node-101",
            new NodeDescription(
                "fulfillment-node", new Ref<>("logical-101"), null, 120, 120, 220, 120, null, null),
            mock(reengineering.ddd.archtype.HasOne.class));
    DiagramEdge createdEdge =
        new DiagramEdge(
            "edge-201",
            new EdgeDescription(
                new Ref<>("node-101"),
                new Ref<>("node-101"),
                null,
                null,
                null,
                null,
                (JsonBlob) null));

    when(projectLogicalEntities.add(any(LogicalEntityDescription.class)))
        .thenReturn(createdLogicalEntity);
    when(diagramNodes.add(any(NodeDescription.class))).thenReturn(createdNode);
    when(diagramEdges.add(any(EdgeDescription.class))).thenReturn(createdEdge);

    LogicalEntitiesApi.CreateLogicalEntityRequest logicalEntityRequest =
        new LogicalEntitiesApi.CreateLogicalEntityRequest();
    logicalEntityRequest.setType(LogicalEntityDescription.Type.EVIDENCE);
    logicalEntityRequest.setName("Order");
    logicalEntityRequest.setLabel("订单");

    NodesApi.CreateNodeRequest nodeRequest = new NodesApi.CreateNodeRequest();
    nodeRequest.setType("fulfillment-node");
    nodeRequest.setLogicalEntityId("logical-1");
    nodeRequest.setPositionX(120);
    nodeRequest.setPositionY(120);
    nodeRequest.setWidth(220);
    nodeRequest.setHeight(120);

    EdgesApi.CreateEdgeRequest edgeRequest = new EdgesApi.CreateEdgeRequest();
    edgeRequest.setSourceNodeId("node-1");
    edgeRequest.setTargetNodeId("node-1");

    DiagramApi.CommitDraftRequest request = new DiagramApi.CommitDraftRequest();
    request.setLogicalEntities(List.of(logicalEntityRequest));
    request.setNodes(List.of(nodeRequest));
    request.setEdges(List.of(edgeRequest));

    given(documentationSpec)
        .accept(MediaType.APPLICATION_JSON)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{id}/commit-draft",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(201)
        .header(
            "Location",
            containsString(
                "/api/projects/" + project.getIdentity() + "/diagrams/" + diagram.getIdentity()));

    ArgumentCaptor<NodeDescription> nodeDescriptionCaptor =
        ArgumentCaptor.forClass(NodeDescription.class);
    ArgumentCaptor<EdgeDescription> edgeDescriptionCaptor =
        ArgumentCaptor.forClass(EdgeDescription.class);

    verify(projectLogicalEntities, times(1)).add(any(LogicalEntityDescription.class));
    verify(diagramNodes, times(1)).add(nodeDescriptionCaptor.capture());
    verify(diagramEdges, times(1)).add(edgeDescriptionCaptor.capture());

    NodeDescription createdNodeDescription = nodeDescriptionCaptor.getValue();
    EdgeDescription createdEdgeDescription = edgeDescriptionCaptor.getValue();

    assertEquals("logical-101", createdNodeDescription.logicalEntity().id());
    assertEquals("node-101", createdEdgeDescription.sourceNode().id());
    assertEquals("node-101", createdEdgeDescription.targetNode().id());
  }

  @Test
  public void should_return_400_when_batch_commit_uses_unknown_node_placeholder_id() {
    EdgesApi.CreateEdgeRequest edge = new EdgesApi.CreateEdgeRequest();
    edge.setSourceNodeId("node-99");
    edge.setTargetNodeId("node-2");

    DiagramApi.CommitDraftRequest request = new DiagramApi.CommitDraftRequest();
    request.setEdges(List.of(edge));

    given(documentationSpec)
        .accept(MediaType.APPLICATION_JSON)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{id}/commit-draft",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(400);

    verify(diagramNodes, times(0)).add(any(NodeDescription.class));
    verify(diagramEdges, times(0)).add(any(EdgeDescription.class));
  }

  @Test
  public void should_return_400_when_batch_commit_uses_unknown_logical_entity_placeholder_id() {
    NodesApi.CreateNodeRequest node = new NodesApi.CreateNodeRequest();
    node.setType("fulfillment-node");
    node.setLogicalEntityId("logical-99");
    node.setPositionX(120);
    node.setPositionY(120);
    node.setWidth(220);
    node.setHeight(120);

    DiagramApi.CommitDraftRequest request = new DiagramApi.CommitDraftRequest();
    request.setNodes(List.of(node));

    given(documentationSpec)
        .accept(MediaType.APPLICATION_JSON)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{id}/commit-draft",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(400);

    verify(projectLogicalEntities, times(0)).add(any(LogicalEntityDescription.class));
    verify(diagramNodes, times(0)).add(any(NodeDescription.class));
    verify(diagramEdges, times(0)).add(any(EdgeDescription.class));
  }

  @Test
  public void should_propose_diagram_model() {
    String requirement = "设计一个订单管理模型";
    Flux<String> expected =
        Flux.just(
            "{\"nodes\":[{\"localData\":{\"name\":\"Order\",\"label\":\"订单\",\"type\":\"EVIDENCE\"}}],",
            "\"edges\":[{\"sourceNode\":{\"id\":\"node-1\"},\"targetNode\":{\"id\":\"node-2\"}}]}");
    when(domainArchitect.proposeModel(requirement)).thenReturn(expected);

    DiagramApi.ProposeModelRequest request = new DiagramApi.ProposeModelRequest();
    request.setRequirement(requirement);

    given(documentationSpec)
        .accept(MediaType.SERVER_SENT_EVENTS)
        .contentType(MediaType.APPLICATION_JSON)
        .body(request)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{id}/propose-model",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(200)
        .contentType(containsString(MediaType.SERVER_SENT_EVENTS))
        .body(containsString("\"type\":\"chunk\""))
        .body(containsString("Order"))
        .body(containsString("\"type\":\"complete\""))
        .body(containsString("[DONE]"));

    verify(domainArchitect, times(1)).proposeModel(requirement);
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
