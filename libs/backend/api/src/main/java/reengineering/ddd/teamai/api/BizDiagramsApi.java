package reengineering.ddd.teamai.api;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.ResourceContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.CollectionModel;
import reengineering.ddd.teamai.api.representation.BizDiagramModel;
import reengineering.ddd.teamai.description.BizDiagramDescription;
import reengineering.ddd.teamai.model.BizDiagram;
import reengineering.ddd.teamai.model.Project;
import reengineering.ddd.teamai.model.User;

@Path("/{user-id}/projects/{project-id}/biz-diagrams")
public class BizDiagramsApi {
  @Context ResourceContext resourceContext;

  private final User user;
  private final Project project;

  public BizDiagramsApi(User user, Project project) {
    this.user = user;
    this.project = project;
  }

  private Project.BizDiagrams bizDiagrams() {
    return (Project.BizDiagrams) project.bizDiagrams();
  }

  @Path("{diagram-id}")
  public BizDiagramApi findById(@PathParam("diagram-id") String id) {
    return bizDiagrams()
        .findByIdentity(id)
        .map(
            diagram -> {
              BizDiagramApi diagramApi = new BizDiagramApi(user, project, diagram);
              return resourceContext.initResource(diagramApi);
            })
        .orElseThrow(() -> new WebApplicationException(Response.Status.NOT_FOUND));
  }

  @GET
  public CollectionModel<BizDiagramModel> findAll(
      @Context UriInfo uriInfo, @DefaultValue("0") @QueryParam("page") int page) {
    return new Pagination<>(bizDiagrams().findAll(), 40)
        .page(
            page,
            diagram -> new BizDiagramModel(user, project, diagram, uriInfo),
            p ->
                ApiTemplates.bizDiagrams(uriInfo)
                    .queryParam("page", p)
                    .build(user.getIdentity(), project.getIdentity()));
  }

  @POST
  @Consumes(MediaType.APPLICATION_JSON)
  public Response create(BizDiagramApi.BizDiagramChange requestBody, @Context UriInfo uriInfo) {
    BizDiagramDescription description =
        new BizDiagramDescription(
            requestBody.getName(),
            requestBody.getDescription(),
            requestBody.getPlantumlCode(),
            requestBody.getDiagramType());
    BizDiagram diagram = bizDiagrams().add(description);
    BizDiagramModel diagramModel = new BizDiagramModel(user, project, diagram, uriInfo);
    return Response.created(
            ApiTemplates.bizDiagram(uriInfo)
                .build(user.getIdentity(), project.getIdentity(), diagram.getIdentity()))
        .entity(diagramModel)
        .build();
  }
}
