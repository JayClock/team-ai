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
import jakarta.ws.rs.core.UriInfo;
import lombok.Data;
import lombok.NoArgsConstructor;
import reengineering.ddd.teamai.api.representation.DiagramModel;
import reengineering.ddd.teamai.description.DiagramDescription;
import reengineering.ddd.teamai.model.Diagram;
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
}
