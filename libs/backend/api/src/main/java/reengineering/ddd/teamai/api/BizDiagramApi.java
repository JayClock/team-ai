package reengineering.ddd.teamai.api;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.teamai.api.representation.BizDiagramModel;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.DiagramType;
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
  public Response update(BizDiagramChange requestBody, @Context UriInfo uriInfo) {
    return Response.ok().entity(get(uriInfo)).build();
  }

  public static class BizDiagramChange {
    private String name;
    private String description;
    private String plantumlCode;
    private DiagramType diagramType;

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }

    public String getDescription() {
      return description;
    }

    public void setDescription(String description) {
      this.description = description;
    }

    public String getPlantumlCode() {
      return plantumlCode;
    }

    public void setPlantumlCode(String plantumlCode) {
      this.plantumlCode = plantumlCode;
    }

    public DiagramType getDiagramType() {
      return diagramType;
    }

    public void setDiagramType(DiagramType diagramType) {
      this.diagramType = diagramType;
    }
  }
}
