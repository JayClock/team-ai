package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.DiagramNodeModel;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramNode;
import reengineering.ddd.teamai.model.Project;

public class NodeApi {
  @Context ResourceContext resourceContext;

  private final Project project;
  private final Diagram diagram;
  private final DiagramNode entity;

  public NodeApi(Project project, Diagram diagram, DiagramNode entity) {
    this.project = project;
    this.diagram = diagram;
    this.entity = entity;
  }

  @GET
  @VendorMediaType(ResourceTypes.NODE)
  public DiagramNodeModel get(@Context UriInfo uriInfo) {
    return new DiagramNodeModel(project, diagram, entity, uriInfo);
  }
}
