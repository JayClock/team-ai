package reengineering.ddd.teamai.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.DiagramVersionModel;
import reengineering.ddd.teamai.model.Diagram;
import reengineering.ddd.teamai.model.DiagramVersion;
import reengineering.ddd.teamai.model.Project;

public class DiagramVersionApi {
  private final Project project;
  private final Diagram diagram;
  private final DiagramVersion version;

  public DiagramVersionApi(Project project, Diagram diagram, DiagramVersion version) {
    this.project = project;
    this.diagram = diagram;
    this.version = version;
  }

  @GET
  @VendorMediaType(ResourceTypes.DIAGRAM_VERSION)
  public DiagramVersionModel get(@Context UriInfo uriInfo) {
    return DiagramVersionModel.of(project, diagram, version, uriInfo);
  }
}
