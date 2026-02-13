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
import reengineering.ddd.teamai.api.representation.DiagramModel;
import reengineering.ddd.teamai.api.schema.WithJsonSchema;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.description.LogicalEntityDescription;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.LogicalEntity;
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
  @Path("commit-draft")
  @Consumes(MediaType.APPLICATION_JSON)
  public Response commitDraft(@Valid CommitDraftRequest request, @Context UriInfo uriInfo) {
    executeInTransaction(
        status -> {
          Map<String, String> createdLogicalEntityIdByRef = new LinkedHashMap<>();
          Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();

          List<LogicalEntitiesApi.CreateLogicalEntityRequest> logicalEntityRequests =
              request.safeLogicalEntities();
          for (int index = 0; index < logicalEntityRequests.size(); index += 1) {
            LogicalEntitiesApi.CreateLogicalEntityRequest logicalEntityRequest =
                logicalEntityRequests.get(index);
            LogicalEntity createdLogicalEntity =
                project.addLogicalEntity(
                    new LogicalEntityDescription(
                        logicalEntityRequest.getType(),
                        logicalEntityRequest.getSubType(),
                        logicalEntityRequest.getName(),
                        logicalEntityRequest.getLabel(),
                        null));
            createdLogicalEntityIdByRef.put(
                "logical-" + (index + 1), createdLogicalEntity.getIdentity());
          }

          List<NodesApi.CreateNodeRequest> nodeRequests = request.safeNodes();
          for (int index = 0; index < nodeRequests.size(); index += 1) {
            NodesApi.CreateNodeRequest nodeRequest = nodeRequests.get(index);
            NodesApi.CreateNodeRequest resolvedNodeRequest = new NodesApi.CreateNodeRequest();
            resolvedNodeRequest.setType(nodeRequest.getType());
            resolvedNodeRequest.setParentId(nodeRequest.getParentId());
            resolvedNodeRequest.setPositionX(nodeRequest.getPositionX());
            resolvedNodeRequest.setPositionY(nodeRequest.getPositionY());
            resolvedNodeRequest.setWidth(nodeRequest.getWidth());
            resolvedNodeRequest.setHeight(nodeRequest.getHeight());
            resolvedNodeRequest.setLogicalEntityId(
                resolveLogicalEntityId(
                    nodeRequest.getLogicalEntityId(), createdLogicalEntityIdByRef));

            DiagramNode createdNode = entity.addNode(NodesApi.toDescription(resolvedNodeRequest));
            createdNodeIdByRef.put("node-" + (index + 1), createdNode.getIdentity());
          }

          for (EdgesApi.CreateEdgeRequest edgeRequest : request.safeEdges()) {
            String sourceNodeId = resolveNodeId(edgeRequest.getSourceNodeId(), createdNodeIdByRef);
            String targetNodeId = resolveNodeId(edgeRequest.getTargetNodeId(), createdNodeIdByRef);
            EdgesApi.CreateEdgeRequest resolvedEdgeRequest = new EdgesApi.CreateEdgeRequest();
            resolvedEdgeRequest.setSourceNodeId(sourceNodeId);
            resolvedEdgeRequest.setTargetNodeId(targetNodeId);
            entity.addEdge(EdgesApi.toDescription(resolvedEdgeRequest));
          }

          return null;
        });

    return Response.created(
            ApiTemplates.diagram(uriInfo).build(project.getIdentity(), entity.getIdentity()))
        .build();
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

  private static String resolveLogicalEntityId(
      String logicalEntityId, Map<String, String> createdLogicalEntityIdByRef) {
    if (logicalEntityId == null || logicalEntityId.isBlank()) {
      return null;
    }
    String resolvedId = createdLogicalEntityIdByRef.get(logicalEntityId);
    if (resolvedId != null) {
      return resolvedId;
    }
    if (logicalEntityId.matches("logical-\\d+")) {
      throw badRequest("Unknown logical entity placeholder id: " + logicalEntityId);
    }
    return logicalEntityId;
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

  @Data
  @NoArgsConstructor
  public static class CommitDraftRequest {
    @WithJsonSchema(LogicalEntitiesApi.CreateLogicalEntityRequest[].class)
    private List<LogicalEntitiesApi.CreateLogicalEntityRequest> logicalEntities;

    @WithJsonSchema(NodesApi.CreateNodeRequest[].class)
    private List<NodesApi.CreateNodeRequest> nodes;

    @WithJsonSchema(EdgesApi.CreateEdgeRequest[].class)
    private List<EdgesApi.CreateEdgeRequest> edges;

    public List<LogicalEntitiesApi.CreateLogicalEntityRequest> safeLogicalEntities() {
      return logicalEntities == null ? List.of() : logicalEntities;
    }

    public List<NodesApi.CreateNodeRequest> safeNodes() {
      return nodes == null ? List.of() : nodes;
    }

    public List<EdgesApi.CreateEdgeRequest> safeEdges() {
      return edges == null ? List.of() : edges;
    }
  }
}
