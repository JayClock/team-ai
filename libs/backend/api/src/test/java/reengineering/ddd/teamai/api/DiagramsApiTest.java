package reengineering.ddd.teamai.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.core.MediaType;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.springframework.hateoas.MediaTypes;
import reactor.core.publisher.Flux;
import reengineering.ddd.archtype.JsonBlob;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.description.ProjectDescription;
import reengineering.ddd.teamai.description.Viewport;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Diagram.Type;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
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
    doAnswer(
            invocation -> {
              commitDraftInAssociation(
                  diagram, invocation.getArgument(1), invocation.getArgument(2));
              return null;
            })
        .when(diagrams)
        .saveDiagram(eq(diagram.getIdentity()), any(), any());
  }

  private static void commitDraftInAssociation(
      Diagram diagram,
      List<Project.Diagrams.DraftNode> draftNodes,
      List<Project.Diagrams.DraftEdge> draftEdges) {
    List<Project.Diagrams.DraftNode> requestedNodes =
        draftNodes == null ? List.of() : List.copyOf(draftNodes);
    List<Project.Diagrams.DraftEdge> requestedEdges =
        draftEdges == null ? List.of() : List.copyOf(draftEdges);

    List<String> draftNodeIds = new ArrayList<>(requestedNodes.size());
    Set<String> uniqueDraftNodeIds = new HashSet<>();
    List<NodeDescription> nodeDescriptions = new ArrayList<>(requestedNodes.size());
    for (Project.Diagrams.DraftNode draftNode : requestedNodes) {
      if (draftNode == null || draftNode.description() == null) {
        throw new Project.Diagrams.InvalidDraftException("Node request must provide description.");
      }
      String draftNodeId = draftNode.id();
      if (draftNodeId == null || draftNodeId.isBlank()) {
        throw new Project.Diagrams.InvalidDraftException("Node request must provide id.");
      }
      if (!uniqueDraftNodeIds.add(draftNodeId)) {
        throw new Project.Diagrams.InvalidDraftException("Duplicated node id: " + draftNodeId);
      }
      draftNodeIds.add(draftNodeId);
      nodeDescriptions.add(draftNode.description());
    }

    List<DiagramNode> createdNodes = diagram.addNodes(nodeDescriptions);
    if (createdNodes.size() != draftNodeIds.size()) {
      throw new Project.Diagrams.InvalidDraftException("Node creation count mismatch.");
    }

    Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();
    for (int index = 0; index < createdNodes.size(); index += 1) {
      String createdNodeId = createdNodes.get(index).getIdentity();
      if (createdNodeId == null || createdNodeId.isBlank()) {
        throw new Project.Diagrams.InvalidDraftException("Created node id must not be blank.");
      }
      createdNodeIdByRef.put(draftNodeIds.get(index), createdNodeId);
      createdNodeIdByRef.put("node-" + (index + 1), createdNodeId);
    }

    List<EdgeDescription> edgeDescriptions = new ArrayList<>(requestedEdges.size());
    for (Project.Diagrams.DraftEdge draftEdge : requestedEdges) {
      if (draftEdge == null) {
        throw new Project.Diagrams.InvalidDraftException("Edge request must provide nodeId.");
      }
      String sourceNodeId = resolveNodeId(draftEdge.sourceNodeId(), createdNodeIdByRef);
      String targetNodeId = resolveNodeId(draftEdge.targetNodeId(), createdNodeIdByRef);
      edgeDescriptions.add(
          new EdgeDescription(
              new Ref<>(sourceNodeId), new Ref<>(targetNodeId), null, null, null, null, null));
    }

    diagram.addEdges(edgeDescriptions);
  }

  private static String resolveNodeId(String nodeId, Map<String, String> createdNodeIdByRef) {
    if (nodeId == null || nodeId.isBlank()) {
      throw new Project.Diagrams.InvalidDraftException("Edge request must provide nodeId.");
    }
    String resolvedId = createdNodeIdByRef.get(nodeId);
    if (resolvedId != null) {
      return resolvedId;
    }
    if (nodeId.matches("node-\\d+")) {
      throw new Project.Diagrams.InvalidDraftException("Unknown node placeholder id: " + nodeId);
    }
    return nodeId;
  }

  @Test
  public void should_return_single_diagram() {
    DiagramNode node =
        new DiagramNode(
            "node-1",
            new NodeDescription("class-node", null, null, 120, 80, 200, 120, null, null),
            mock(reengineering.ddd.archtype.HasOne.class));
    DiagramEdge edge =
        new DiagramEdge(
            "edge-1",
            new EdgeDescription(
                new Ref<>("node-1"),
                new Ref<>("node-2"),
                "right",
                "left",
                "ASSOCIATION",
                "relates-to",
                (JsonBlob) null));
    when(diagramNodes.findAll()).thenReturn(new EntityList<>(node));
    when(diagramEdges.findAll()).thenReturn(new EntityList<>(edge));

    given(documentationSpec)
        .accept(MediaTypes.HAL_FORMS_JSON_VALUE)
        .when()
        .get("/projects/{projectId}/diagrams/{id}", project.getIdentity(), diagram.getIdentity())
        .then()
        .statusCode(200)
        .body("id", is(diagram.getIdentity()))
        .body("title", is(diagram.getDescription().title()))
        .body("type", is("class"))
        .body("status", is("draft"))
        .body("viewport.x", is(100.0F))
        .body("viewport.y", is(50.0F))
        .body("viewport.zoom", is(1.5F))
        .body("_embedded.nodes", hasSize(1))
        .body("_embedded.nodes[0].id", is(node.getIdentity()))
        .body("_embedded.nodes[0].type", is("class-node"))
        .body("_embedded.edges", hasSize(1))
        .body("_embedded.edges[0].id", is(edge.getIdentity()))
        .body("_embedded.edges[0].relationType", is("ASSOCIATION"))
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
            "_links.versions.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/versions"))
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
        .body(
            "_links.publish.href",
            is(
                "/api/projects/"
                    + project.getIdentity()
                    + "/diagrams/"
                    + diagram.getIdentity()
                    + "/publish"))
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
        .body("_templates.'create-version'.method", is("POST"))
        .body("_templates.propose-model.method", is("POST"))
        .body("_templates.propose-model.properties", hasSize(1))
        .body("_templates.propose-model.properties[0].name", is("requirement"))
        .body("_templates.propose-model.properties[0].required", is(true))
        .body("_templates.propose-model.properties[0].type", is("text"))
        .body("_templates.'commit-draft'.method", is("POST"))
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
            containsString("targetNode"))
        .body("_templates.'publish-diagram'.method", is("POST"))
        .body("_templates.'publish-diagram'.properties", hasSize(0));

    verify(diagrams, times(1)).findByIdentity(diagram.getIdentity());
    verify(diagramNodes, times(1)).findAll();
    verify(diagramEdges, times(1)).findAll();
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

    when(diagramNodes.addAll(any())).thenReturn(List.of(createdNode1, createdNode2));
    when(diagramEdges.addAll(any())).thenReturn(List.of(createdEdge));

    DiagramApi.CommitDraftNodeSchema node1 = new DiagramApi.CommitDraftNodeSchema();
    node1.setId("node-1");
    node1.setType("fulfillment-node");
    node1.setPositionX(120);
    node1.setPositionY(120);
    node1.setWidth(220);
    node1.setHeight(120);

    DiagramApi.CommitDraftNodeSchema node2 = new DiagramApi.CommitDraftNodeSchema();
    node2.setId("node-2");
    node2.setType("fulfillment-node");
    node2.setPositionX(420);
    node2.setPositionY(120);
    node2.setWidth(220);
    node2.setHeight(120);

    DiagramApi.CommitDraftEdgeSchema edge = new DiagramApi.CommitDraftEdgeSchema();
    edge.setSourceNode(new Ref<>("node-1"));
    edge.setTargetNode(new Ref<>("node-2"));

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

    verify(diagramNodes, times(1)).addAll(any());
    verify(diagramEdges, times(1)).addAll(any());
  }

  @Test
  public void should_batch_commit_nodes_with_direct_logical_entity_id() {
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

    when(diagramNodes.addAll(any())).thenReturn(List.of(createdNode));
    when(diagramEdges.addAll(any())).thenReturn(List.of(createdEdge));

    DiagramApi.CommitDraftNodeSchema nodeRequest = new DiagramApi.CommitDraftNodeSchema();
    nodeRequest.setId("draft-node-1");
    nodeRequest.setType("fulfillment-node");
    nodeRequest.setLogicalEntity(new Ref<>("logical-101"));
    nodeRequest.setLocalData(Map.of("name", "Order", "label", "订单", "type", "EVIDENCE"));
    nodeRequest.setPositionX(120);
    nodeRequest.setPositionY(120);
    nodeRequest.setWidth(220);
    nodeRequest.setHeight(120);

    DiagramApi.CommitDraftEdgeSchema edgeRequest = new DiagramApi.CommitDraftEdgeSchema();
    edgeRequest.setSourceNode(new Ref<>("draft-node-1"));
    edgeRequest.setTargetNode(new Ref<>("draft-node-1"));

    DiagramApi.CommitDraftRequest request = new DiagramApi.CommitDraftRequest();
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

    verify(projectLogicalEntities, times(0)).add(any());
    verify(diagramNodes, times(1))
        .addAll(
            argThat(
                descriptions ->
                    descriptions.size() == 1
                        && "logical-101"
                            .equals(
                                descriptions.iterator().next().logicalEntity() == null
                                    ? null
                                    : descriptions.iterator().next().logicalEntity().id())
                        && descriptions.iterator().next().localData() != null
                        && descriptions
                            .iterator()
                            .next()
                            .localData()
                            .json()
                            .contains("\"name\":\"Order\"")
                        && descriptions
                            .iterator()
                            .next()
                            .localData()
                            .json()
                            .contains("\"label\":\"订单\"")
                        && descriptions
                            .iterator()
                            .next()
                            .localData()
                            .json()
                            .contains("\"type\":\"EVIDENCE\"")));
    verify(diagramEdges, times(1))
        .addAll(
            argThat(
                descriptions ->
                    descriptions.size() == 1
                        && "node-101".equals(descriptions.iterator().next().sourceNode().id())
                        && "node-101".equals(descriptions.iterator().next().targetNode().id())));
  }

  @Test
  public void should_return_400_when_batch_commit_uses_unknown_node_placeholder_id() {
    DiagramApi.CommitDraftEdgeSchema edge = new DiagramApi.CommitDraftEdgeSchema();
    edge.setSourceNode(new Ref<>("node-99"));
    edge.setTargetNode(new Ref<>("node-2"));

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

    verify(diagramNodes, times(0)).addAll(any());
    verify(diagramEdges, times(0)).addAll(any());
  }

  @Test
  public void should_return_400_when_batch_commit_uses_duplicated_node_id() {
    DiagramApi.CommitDraftNodeSchema node1 = new DiagramApi.CommitDraftNodeSchema();
    node1.setId("dup-node");
    node1.setType("fulfillment-node");
    node1.setPositionX(120);
    node1.setPositionY(120);
    node1.setWidth(220);
    node1.setHeight(120);

    DiagramApi.CommitDraftNodeSchema node2 = new DiagramApi.CommitDraftNodeSchema();
    node2.setId("dup-node");
    node2.setType("fulfillment-node");
    node2.setPositionX(420);
    node2.setPositionY(120);
    node2.setWidth(220);
    node2.setHeight(120);

    DiagramApi.CommitDraftRequest request = new DiagramApi.CommitDraftRequest();
    request.setNodes(List.of(node1, node2));

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

    verify(diagramNodes, times(0)).addAll(any());
    verify(diagramEdges, times(0)).addAll(any());
  }

  @Test
  public void should_accept_logical_entity_id_without_placeholder_resolution() {
    DiagramApi.CommitDraftNodeSchema node = new DiagramApi.CommitDraftNodeSchema();
    node.setId("draft-node-99");
    node.setType("fulfillment-node");
    node.setLogicalEntity(new Ref<>("logical-99"));
    node.setPositionX(120);
    node.setPositionY(120);
    node.setWidth(220);
    node.setHeight(120);

    DiagramApi.CommitDraftRequest request = new DiagramApi.CommitDraftRequest();
    request.setNodes(List.of(node));

    DiagramNode createdNode =
        new DiagramNode(
            "node-105",
            new NodeDescription(
                "fulfillment-node", new Ref<>("logical-99"), null, 120, 120, 220, 120, null, null),
            mock(reengineering.ddd.archtype.HasOne.class));
    when(diagramNodes.addAll(any())).thenReturn(List.of(createdNode));

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
        .statusCode(201);

    verify(projectLogicalEntities, times(0)).add(any());
    verify(diagramNodes, times(1))
        .addAll(
            argThat(
                descriptions ->
                    descriptions.size() == 1
                        && "logical-99"
                            .equals(
                                descriptions.iterator().next().logicalEntity() == null
                                    ? null
                                    : descriptions.iterator().next().logicalEntity().id())));
    verify(diagramEdges, times(0)).addAll(any());
  }

  @Test
  public void should_publish_diagram() {
    given(documentationSpec)
        .accept(MediaType.APPLICATION_JSON)
        .when()
        .post(
            "/projects/{projectId}/diagrams/{id}/publish",
            project.getIdentity(),
            diagram.getIdentity())
        .then()
        .statusCode(204);

    verify(diagrams, times(1)).publishDiagram(diagram.getIdentity());
  }

  @Test
  public void should_propose_diagram_model() {
    String requirement = "设计一个订单管理模型";
    Flux<String> expected =
        Flux.just(
            "{\"nodes\":[{\"id\":\"node-1\",\"localData\":{\"name\":\"Order\",\"label\":\"订单\",\"type\":\"EVIDENCE\"}}],",
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
        .body(containsString("data: {\"nodes\""))
        .body(containsString("event: structured"))
        .body(containsString("\"kind\":\"diagram-model\""))
        .body(containsString("\"format\":\"json\""))
        .body(containsString("Order"))
        .body(containsString("event: complete"));

    verify(domainArchitect, times(1)).proposeModel(requirement);
  }

  @Test
  public void should_return_error_when_model_wraps_json_with_markdown() {
    String requirement = "设计一个订单管理模型";
    Flux<String> expected =
        Flux.just(
            "```json\n{\"nodes\":[{\"id\":\"node-1\"}],",
            "\"edges\":[{\"sourceNode\":{\"id\":\"node-1\"},\"targetNode\":{\"id\":\"node-2\"}}]}\n```");
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
        .body(containsString("event: structured"))
        .body(containsString("\"format\":\"json\""))
        .body(containsString("event: error"))
        .body(containsString("模型响应不是有效的草稿图 JSON。"));
  }

  @Test
  public void should_return_error_event_when_propose_model_stream_is_not_json() {
    String requirement = "输出普通文本";
    when(domainArchitect.proposeModel(requirement)).thenReturn(Flux.just("plain-text-output"));

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
        .body(containsString("event: error"))
        .body(containsString("模型响应不是有效的草稿图 JSON。"));
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
