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
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.archtype.Ref;
import reengineering.ddd.teamai.api.representation.DiagramModel;
import reengineering.ddd.teamai.api.schema.WithJsonSchema;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.Project;

public class DiagramApi {
  @Inject private Diagram.DomainArchitect domainArchitect;
  @Inject private DiagramSseEventWriter diagramSseEventWriter;
  @Inject private DiagramCommitDraftMapper diagramCommitDraftMapper;
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;

  public DiagramApi(Project project, Diagram entity) {
    this.project = project;
    this.diagram = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.DIAGRAM)
  public DiagramModel get(@Context UriInfo uriInfo) {
    return DiagramModel.of(project, diagram, uriInfo);
  }

  @Path("nodes")
  public NodesApi nodes() {
    return resourceContext.initResource(new NodesApi(project, diagram));
  }

  @Path("edges")
  public EdgesApi edges() {
    return resourceContext.initResource(new EdgesApi(project, diagram));
  }

  @Path("versions")
  public DiagramVersionsApi versions() {
    return resourceContext.initResource(new DiagramVersionsApi(project, diagram));
  }

  @POST
  @Path("propose-model")
  @Consumes(MediaType.APPLICATION_JSON)
  @Produces(MediaType.SERVER_SENT_EVENTS)
  public void proposeModel(
      @Valid ProposeModelRequest request, @Context SseEventSink sseEventSink, @Context Sse sse) {
    StringBuilder structuredBuffer = new StringBuilder();

    diagram
        .proposeModel(request.getRequirement(), domainArchitect)
        .subscribe(
            chunk -> {
              String payload = chunk == null ? "" : chunk;
              if (payload.isEmpty()) {
                return;
              }

              structuredBuffer.append(payload);
              diagramSseEventWriter.sendEvent(sseEventSink, sse, null, payload);
              diagramSseEventWriter.sendStructuredChunk(
                  sseEventSink, sse, "diagram-model", "json", payload);
            },
            error -> {
              diagramSseEventWriter.sendEvent(
                  sseEventSink, sse, "error", error == null ? null : error.getMessage());
              sseEventSink.close();
            },
            () -> {
              if (!diagramSseEventWriter.isValidJson(structuredBuffer.toString())) {
                diagramSseEventWriter.sendEvent(sseEventSink, sse, "error", "模型响应不是有效的草稿图 JSON。");
                sseEventSink.close();
                return;
              }

              diagramSseEventWriter.sendEvent(sseEventSink, sse, "complete", "");
              sseEventSink.close();
            });
  }

  @POST
  @Path("commit-draft")
  @Consumes(MediaType.APPLICATION_JSON)
  public Response commitDraft(@Valid CommitDraftRequest request, @Context UriInfo uriInfo) {
    DiagramCommitDraftMapper.DraftPayload draft = diagramCommitDraftMapper.map(request);

    try {
      project.saveDiagram(diagram.getIdentity(), draft.nodes(), draft.edges());
    } catch (Project.Diagrams.InvalidDraftException error) {
      throw badRequest(error.getMessage());
    }

    return Response.created(
            ApiTemplates.diagram(uriInfo).build(project.getIdentity(), diagram.getIdentity()))
        .build();
  }

  @POST
  @Path("publish")
  public Response publishDiagram() {
    project.publishDiagram(diagram.getIdentity());
    return Response.noContent().build();
  }

  private static RuntimeException badRequest(String message) {
    return new jakarta.ws.rs.BadRequestException(message);
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
    @NotNull private Boolean hidden;
  }
}
