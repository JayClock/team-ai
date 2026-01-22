package reengineering.ddd.teamai.api;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import reengineering.ddd.teamai.api.representation.BizDiagramModel;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

@Path("/{user-id}/projects/{project-id}/biz-diagrams/{diagram-id}")
public class BizDiagramApi {

  private final User user;
  private final Project project;
  private final BizDiagram diagram;

  public BizDiagramApi(User user, Project project, BizDiagram diagram) {
    this.user = user;
    this.project = project;
    this.diagram = diagram;
  }

  @GET
  public BizDiagramModel get(@Context UriInfo uriInfo) {
    return new BizDiagramModel(user, project, diagram, uriInfo);
  }

  @DELETE
  public Response delete() {
    ((Project.BizDiagrams) project.bizDiagrams()).delete(diagram.getIdentity());
    return Response.noContent().build();
  }

  @PUT
  @Consumes(MediaType.APPLICATION_JSON)
  public Response update(BizDiagram.BizDiagramChange requestBody, @Context UriInfo uriInfo) {
    return Response.ok().entity(get(uriInfo)).build();
  }
}
