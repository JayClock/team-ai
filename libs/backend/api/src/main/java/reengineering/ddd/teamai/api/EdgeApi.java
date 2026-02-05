package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.DiagramEdgeModel;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramEdge;
import reengineering.ddd.teamai.model.Project;

public class EdgeApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;
  private final DiagramEdge entity;

  public EdgeApi(Project project, Diagram diagram, DiagramEdge entity) {
    this.project = project;
    this.diagram = diagram;
    this.entity = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.EDGE)
  public DiagramEdgeModel get(@Context UriInfo uriInfo) {
    return new DiagramEdgeModel(project, diagram, entity, uriInfo);
  }
}
