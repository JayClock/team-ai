package reengineering.ddd.teamai.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.context.ApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.ContextLoader;
import reengineering.ddd.teamai.api.representation.DiagramEdgeModel;
import reengineering.ddd.teamai.api.representation.DiagramModel;
import reengineering.ddd.teamai.api.representation.DiagramNodeModel;
import reengineering.ddd.teamai.api.schema.WithJsonSchema;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.Project;

public class DiagramApi {
  @Inject private Diagram.DomainArchitect domainArchitect;
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram entity;

  public DiagramApi(Project project, Diagram entity) {
    this.project = project;
    this.entity = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.DIAGRAM)
  public DiagramModel get(@Context UriInfo uriInfo) {
    return DiagramModel.of(project, entity, uriInfo);
  }

  @Path("nodes")
  public NodesApi nodes() {
    return resourceContext.initResource(new NodesApi(project, entity));
  }

  @Path("edges")
  public EdgesApi edges() {
    return resourceContext.initResource(new EdgesApi(project, entity));
  }

  @POST
  @Path("propose-model")
  @Consumes(MediaType.APPLICATION_JSON)
  public DiagramDescription.DraftDiagram proposeModel(@Valid ProposeModelRequest request) {
    return entity.proposeModel(request.getRequirement(), domainArchitect);
  }

  @POST
  @Path("batch-commit")
  @Consumes(MediaType.APPLICATION_JSON)
  public Response batchCommit(@Valid BatchCommitRequest request, @Context UriInfo uriInfo) {
    BatchCommitResult result =
        executeInTransaction(
            status -> {
              List<DiagramNode> createdNodes = new ArrayList<>();
              List<DiagramEdge> createdEdges = new ArrayList<>();
              Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();

              List<NodesApi.CreateNodeRequest> nodeRequests = request.safeNodes();
              for (int index = 0; index < nodeRequests.size(); index += 1) {
                NodesApi.CreateNodeRequest nodeRequest = nodeRequests.get(index);
                DiagramNode createdNode = entity.addNode(NodesApi.toDescription(nodeRequest));
                createdNodes.add(createdNode);
                createdNodeIdByRef.put("node-" + (index + 1), createdNode.getIdentity());
              }

              for (EdgesApi.CreateEdgeRequest edgeRequest : request.safeEdges()) {
                String sourceNodeId =
                    resolveNodeId(edgeRequest.getSourceNodeId(), createdNodeIdByRef);
                String targetNodeId =
                    resolveNodeId(edgeRequest.getTargetNodeId(), createdNodeIdByRef);
                EdgesApi.CreateEdgeRequest resolvedEdgeRequest = new EdgesApi.CreateEdgeRequest();
                resolvedEdgeRequest.setSourceNodeId(sourceNodeId);
                resolvedEdgeRequest.setTargetNodeId(targetNodeId);
                DiagramEdge createdEdge =
                    entity.addEdge(EdgesApi.toDescription(resolvedEdgeRequest));
                createdEdges.add(createdEdge);
              }

              return new BatchCommitResult(createdNodes, createdEdges, createdNodeIdByRef);
            });

    if (result == null) {
      throw new IllegalStateException("Batch commit transaction returned null result.");
    }

    BatchCommitResponse response =
        BatchCommitResponse.of(
            project,
            entity,
            uriInfo,
            result.createdNodes(),
            result.createdEdges(),
            result.nodeIdMapping());
    return Response.ok(response).build();
  }

  private static String resolveNodeId(String nodeId, Map<String, String> createdNodeIdByRef) {
    if (nodeId == null || nodeId.isBlank()) {
      throw badRequest("Edge request must provide nodeId.");
    }
    String resolvedId = createdNodeIdByRef.get(nodeId);
    if (resolvedId != null) {
      return resolvedId;
    }
    if (nodeId.matches("node-\\d+")) {
      throw badRequest("Unknown node placeholder id: " + nodeId);
    }
    return nodeId;
  }

  private static RuntimeException badRequest(String message) {
    return new jakarta.ws.rs.BadRequestException(message);
  }

  private static <T> T executeInTransaction(TransactionCallback<T> callback) {
    ApplicationContext context = ContextLoader.getCurrentWebApplicationContext();
    if (context == null) {
      return callback.doInTransaction(new SimpleTransactionStatus());
    }
    if (context.containsBean("transactionManager")) {
      PlatformTransactionManager transactionManager =
          context.getBean("transactionManager", PlatformTransactionManager.class);
      return new TransactionTemplate(transactionManager).execute(callback);
    }
    Map<String, PlatformTransactionManager> transactionManagers =
        context.getBeansOfType(PlatformTransactionManager.class);
    if (transactionManagers.isEmpty()) {
      return callback.doInTransaction(new SimpleTransactionStatus());
    }
    PlatformTransactionManager transactionManager = transactionManagers.values().iterator().next();
    return new TransactionTemplate(transactionManager).execute(callback);
  }

  @Data
  @NoArgsConstructor
  public static class UpdateDiagramApi {
    @NotNull private String title;

    @JsonProperty("viewport.x")
    private Double viewportX;

    @JsonProperty("viewport.y")
    private Double viewportY;

    @JsonProperty("viewport.zoom")
    private Double viewportZoom;
  }

  @Data
  @NoArgsConstructor
  public static class ProposeModelRequest {
    @NotNull private String requirement;
  }

  public record BatchCommitResult(
      List<DiagramNode> createdNodes,
      List<DiagramEdge> createdEdges,
      Map<String, String> nodeIdMapping) {}

  @Data
  @NoArgsConstructor
  public static class BatchCommitRequest {
    @WithJsonSchema(NodesApi.CreateNodeRequest[].class)
    private List<NodesApi.CreateNodeRequest> nodes;

    @WithJsonSchema(EdgesApi.CreateEdgeRequest[].class)
    private List<EdgesApi.CreateEdgeRequest> edges;

    public List<NodesApi.CreateNodeRequest> safeNodes() {
      return nodes == null ? List.of() : nodes;
    }

    public List<EdgesApi.CreateEdgeRequest> safeEdges() {
      return edges == null ? List.of() : edges;
    }
  }

  @Data
  @NoArgsConstructor
  public static class BatchCommitResponse {
    private List<DiagramNodeModel> nodes;
    private List<DiagramEdgeModel> edges;
    private Map<String, String> nodeIdMapping;

    public static BatchCommitResponse of(
        Project project,
        Diagram diagram,
        UriInfo uriInfo,
        List<DiagramNode> createdNodes,
        List<DiagramEdge> createdEdges,
        Map<String, String> nodeIdMapping) {
      BatchCommitResponse response = new BatchCommitResponse();
      response.setNodes(
          createdNodes.stream()
              .map(node -> DiagramNodeModel.of(project, diagram, node, uriInfo))
              .toList());
      response.setEdges(
          createdEdges.stream()
              .map(edge -> DiagramEdgeModel.simple(project, diagram, edge, uriInfo))
              .toList());
      response.setNodeIdMapping(nodeIdMapping);
      return response;
    }
  }
}
