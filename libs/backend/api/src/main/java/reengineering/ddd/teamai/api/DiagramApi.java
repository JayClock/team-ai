package reengineering.ddd.teamai.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
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
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.DiagramModel;
import reengineering.ddd.teamai.api.schema.WithJsonSchema;
import reengineering.ddd.teamai.description.EdgeDescription;
import reengineering.ddd.teamai.description.NodeDescription;
import reengineering.ddd.teamai.model.Diagram;
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
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void proposeModel(
      @Valid ProposeModelRequest request, @Context SseEventSink sseEventSink, @Context Sse sse) {
    entity
        .proposeModel(request.getRequirement(), domainArchitect)
        .subscribe(
            chunk -> sendSseEvent(sseEventSink, sse, null, chunk),
            error -> {
              sendSseEvent(sseEventSink, sse, "error", error == null ? null : error.getMessage());
              sseEventSink.close();
            },
            () -> {
              sendSseEvent(sseEventSink, sse, "complete", "");
              sseEventSink.close();
            });
  }

  @POST
  @Path("commit-draft")
  @Consumes(MediaType.APPLICATION_JSON)
  public Response commitDraft(@Valid CommitDraftRequest request, @Context UriInfo uriInfo) {
    executeInTransaction(
        status -> {
          Map<String, String> createdNodeIdByRef = new LinkedHashMap<>();

          List<CommitDraftNodeSchema> nodeRequests = request.safeNodes();
          for (int index = 0; index < nodeRequests.size(); index += 1) {
            CommitDraftNodeSchema nodeRequest = nodeRequests.get(index);
            String draftNodeId = nodeRequest.getId();
            if (draftNodeId == null || draftNodeId.isBlank()) {
              throw badRequest("Node request must provide id.");
            }

            DiagramNode createdNode = entity.addNode(nodeRequest.toDescription());
            createdNodeIdByRef.put(draftNodeId, createdNode.getIdentity());
            // Backward compatibility with older indexed placeholder references.
            createdNodeIdByRef.put("node-" + (index + 1), createdNode.getIdentity());
          }

          for (CommitDraftEdgeSchema edgeRequest : request.safeEdges()) {
            String sourceNodeId = resolveNodeId(edgeRequest.getSourceNodeId(), createdNodeIdByRef);
            String targetNodeId = resolveNodeId(edgeRequest.getTargetNodeId(), createdNodeIdByRef);
            entity.addEdge(edgeRequest.toDescription(sourceNodeId, targetNodeId));
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

  private static RuntimeException badRequest(String message) {
    return new jakarta.ws.rs.BadRequestException(message);
  }

  private void sendSseEvent(SseEventSink sseEventSink, Sse sse, String eventName, String data) {
    String payload = data == null ? "" : data;
    OutboundSseEvent.Builder builder = sse.newEventBuilder();
    if (eventName != null && !eventName.isBlank()) {
      builder.name(eventName);
    }
    OutboundSseEvent event = builder.data(String.class, payload).build();
    sseEventSink.send(event);
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
    @WithJsonSchema(CommitDraftNodeSchema[].class)
    @Valid
    private List<CommitDraftNodeSchema> nodes;

    @WithJsonSchema(CommitDraftEdgeSchema[].class)
    @Valid
    private List<CommitDraftEdgeSchema> edges;

    public List<CommitDraftNodeSchema> safeNodes() {
      return nodes == null ? List.of() : nodes;
    }

    public List<CommitDraftEdgeSchema> safeEdges() {
      return edges == null ? List.of() : edges;
    }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  @Data
  @NoArgsConstructor
  public static class CommitDraftNodeSchema {
    @NotNull private String id;
    @NotNull private String type;
    private Ref<String> logicalEntity;
    private Ref<String> parent;
    private double positionX;
    private double positionY;
    private Object localData;
    @NotNull private Integer width;
    @NotNull private Integer height;

    public NodeDescription toDescription() {
      return new NodeDescription(
          type, logicalEntity, parent, positionX, positionY, width, height, null, null);
    }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  @Data
  @NoArgsConstructor
  public static class CommitDraftEdgeSchema {
    @NotNull private Ref<String> sourceNode;
    @NotNull private Ref<String> targetNode;

    private String id;
    private String sourceHandle;
    private String targetHandle;
    private String relationType;
    private String label;
    private Object styleProps;

    public String getSourceNodeId() {
      return sourceNode == null ? null : sourceNode.id();
    }

    public String getTargetNodeId() {
      return targetNode == null ? null : targetNode.id();
    }

    public EdgeDescription toDescription(String sourceNodeId, String targetNodeId) {
      return new EdgeDescription(
          new Ref<>(sourceNodeId), new Ref<>(targetNodeId), null, null, null, null, null);
    }
  }
}
